// =========================================================================
// razorpay-settlement-sync  —  daily pg_cron job, and the admin "Sync now"
//
// Razorpay pays out in bulk: a day's rider payments, minus refunds, minus
// its fee and the GST on that fee, land in HDFC as ONE credit with a UTR.
// This pulls Razorpay's own settlement recon report — one row per payment,
// refund or adjustment, each carrying its fee, fee GST, settlement id and
// UTR — and stores it as external_statements (one per settlement) and
// external_statement_lines (one per row). Then it asks the database to match
// every line to our payment_transactions and refunds
// (match_razorpay_statement_lines), which is where exceptions E1–E8 come
// from.
//
// Idempotent. A settlement already stored keeps its lines; only rows not yet
// seen are added, so re-reading a day — the cron re-reads the last 7 —
// changes nothing it has already recorded. Statement figures are refreshed
// from Razorpay's settlement entity on each run.
//
// Body (optional): { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } — IST days
// whose SETTLEMENTS to read. Default: the last 7 days. A range is capped at
// 62 days so one call stays inside the function's time limit.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { addDays, businessToday } from "../_shared/dates.ts";

const SOURCE = "razorpay-settlement-sync";
const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const MAX_DAYS = 62;
const PAGE = 1000;

interface ReconItem {
    entity_id: string;
    type: "payment" | "refund" | "transfer" | "adjustment";
    debit: number;
    credit: number;
    amount: number;
    fee: number;
    tax: number;
    on_hold: boolean;
    settled: boolean;
    created_at: number;
    settled_at: number | null;
    settlement_id: string | null;
    settlement_utr: string | null;
    description: string | null;
    payment_id: string | null;
    order_id: string | null;
    method: string | null;
    dispute_id: string | null;
}

interface SettlementEntity {
    id: string;
    amount: number;
    fees: number | null;
    tax: number | null;
    utr: string | null;
    status: string;
    created_at: number;
}

const rupees = (paise: number | null | undefined) => Math.round(Number(paise ?? 0)) / 100;
const round2 = (n: number) => Math.round(n * 100) / 100;
const istDate = (unix: number) =>
    new Date(unix * 1000 + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

async function rzp<T>(path: string, auth: string): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, { headers: { authorization: auth } });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        const message = (body as { error?: { description?: string } } | null)?.error?.description ?? res.statusText;
        throw new Error(`Razorpay ${path.split("?")[0]} → ${res.status}: ${message}`);
    }
    return body as T;
}

/** Every recon row Razorpay settled on one IST day. */
async function reconForDay(day: string, auth: string): Promise<ReconItem[]> {
    const [y, m, d] = day.split("-");
    const out: ReconItem[] = [];
    for (let skip = 0; ; skip += PAGE) {
        const page = await rzp<{ items: ReconItem[] }>(
            `/settlements/recon/combined?year=${y}&month=${m}&day=${d}&count=${PAGE}&skip=${skip}`, auth,
        );
        out.push(...(page.items ?? []));
        if ((page.items ?? []).length < PAGE) break;
    }
    return out;
}

/** Settlement entities created in [from, to] (IST days), keyed by id. */
async function settlementsBetween(from: string, to: string, auth: string): Promise<Map<string, SettlementEntity>> {
    const fromUnix = Math.floor(new Date(`${from}T00:00:00+05:30`).getTime() / 1000);
    const toUnix = Math.floor(new Date(`${addDays(to, 1)}T00:00:00+05:30`).getTime() / 1000);
    const map = new Map<string, SettlementEntity>();
    for (let skip = 0; ; skip += 100) {
        const page = await rzp<{ items: SettlementEntity[] }>(
            `/settlements?from=${fromUnix}&to=${toUnix}&count=100&skip=${skip}`, auth,
        );
        for (const s of page.items ?? []) map.set(s.id, s);
        if ((page.items ?? []).length < 100) break;
    }
    return map;
}

function lineAmounts(item: ReconItem): { amount: number; net: number } {
    const net = round2(rupees(item.credit) - rupees(item.debit));
    if (item.type === "payment") return { amount: rupees(item.amount), net };
    if (item.type === "refund") return { amount: -rupees(item.amount), net };
    return { amount: net, net };
}

async function storeSettlement(
    admin: Admin, settlementId: string, items: ReconItem[], entity: SettlementEntity | undefined,
): Promise<{ added: number }> {
    const sum = (f: (i: ReconItem) => number) => round2(items.reduce((s, i) => s + f(i), 0));
    const settledAt = entity?.created_at ?? items.find((i) => i.settled_at)?.settled_at ?? items[0].created_at;

    const statementRow = {
        source: "razorpay",
        external_ref: settlementId,
        utr: entity?.utr ?? items.find((i) => i.settlement_utr)?.settlement_utr ?? null,
        statement_date: istDate(settledAt),
        gross_amount: sum((i) => (i.type === "payment" ? rupees(i.amount) : 0)),
        refund_amount: sum((i) => (i.type === "refund" ? rupees(i.amount) : 0)),
        fee_amount: sum((i) => rupees(i.fee)),
        tax_amount: sum((i) => rupees(i.tax)),
        // Razorpay's own figure when we have the entity; otherwise what the lines say moved.
        net_amount: entity ? rupees(entity.amount) : sum((i) => lineAmounts(i).net),
        raw: entity ?? null,
        synced_at: new Date().toISOString(),
    };

    const { data: statement, error: statementError } = await admin
        .from("external_statements")
        .upsert(statementRow, { onConflict: "source,external_ref" })
        .select("id")
        .single();
    if (statementError) throw statementError;

    const { data: existing, error: existingError } = await admin
        .from("external_statement_lines")
        .select("external_id, kind, line_no")
        .eq("statement_id", statement.id);
    if (existingError) throw existingError;

    const seen = new Set((existing ?? []).map((r) => `${r.kind}:${r.external_id}`));
    let nextLine = (existing ?? []).reduce((m, r) => Math.max(m, r.line_no), 0) + 1;

    const fresh = items
        .filter((i) => !seen.has(`${i.type}:${i.entity_id}`))
        .sort((a, b) => a.created_at - b.created_at)
        .map((i) => {
            const { amount, net } = lineAmounts(i);
            return {
                statement_id: statement.id,
                source: "razorpay",
                line_no: nextLine++,
                external_id: i.entity_id,
                kind: i.type,
                occurred_at: new Date(i.created_at * 1000).toISOString(),
                value_date: i.settled_at ? istDate(i.settled_at) : null,
                amount,
                net_amount: net,
                fee: rupees(i.fee),
                tax: rupees(i.tax),
                method: i.method,
                gateway_order_id: i.order_id,
                dispute_id: i.dispute_id,
                on_hold: !!i.on_hold,
                description: i.description,
                raw: i,
            };
        });

    if (fresh.length > 0) {
        const { error } = await admin.from("external_statement_lines").insert(fresh);
        if (error) throw error;
    }
    return { added: fresh.length };
}

Deno.serve(async (req) => {
    if (!isConfigured()) return notConfigured();
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
        return json({ error: "Payment gateway not configured." }, 500);
    }

    const admin = adminClient();
    const auth = "Basic " + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
    const today = await businessToday(admin);
    const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const to = isDay(body.to) && body.to <= today ? body.to : today;
    const from = isDay(body.from) ? body.from : addDays(to, -7);
    if (from > to) return json({ error: "`from` must be on or before `to`." }, 400);

    const days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    if (days.length > MAX_DAYS) return json({ error: `Sync at most ${MAX_DAYS} days at a time.` }, 400);

    try {
        // Settlement entities are created on the payout day; read a day either
        // side so a settlement near midnight is not missed.
        const entities = await settlementsBetween(addDays(from, -1), addDays(to, 1), auth);

        const bySettlement = new Map<string, ReconItem[]>();
        for (const day of days) {
            for (const item of await reconForDay(day, auth)) {
                if (!item.settlement_id) continue; // not paid out yet — next run picks it up
                const list = bySettlement.get(item.settlement_id) ?? [];
                list.push(item);
                bySettlement.set(item.settlement_id, list);
            }
        }

        let added = 0;
        for (const [settlementId, items] of bySettlement) {
            added += (await storeSettlement(admin, settlementId, items, entities.get(settlementId))).added;
        }

        const { data: matched, error: matchError } = await admin.rpc("match_razorpay_statement_lines");
        if (matchError) throw matchError;

        const result = { from, to, settlements: bySettlement.size, linesAdded: added, linesMatched: matched ?? 0 };
        console.log(`[${SOURCE}]`, result);
        return json(result, 200);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[${SOURCE}] failed`, message);
        return json({ error: message }, 502);
    }
});
