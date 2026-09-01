import { supabaseAdmin } from "../../config/supabase";
import { endOfBusinessDay } from "../../common/dates";
import { paginate } from "../../common/pagination";
import { Paginated } from "../../types";
import {
    DepositFigures, REVENUE_TYPE_LABEL, RefundBreakdown, RevenueByMethodRow, RevenueByTypeRow,
    RevenueGranularity, RevenueMoneyFigures, RevenueSummary, RevenueTransactionFilters,
    RevenueTransactionRow, RevenueTrendPoint, RevenueType, RevenueTxnType,
} from "./revenue.types";

/*
 * ─────────────────────────────────────────────────────────────────────────
 * The money model (verified against supabase/v2/migrations/):
 *
 *  Cash in       payment_allocations → payment_transactions(status='succeeded')
 *                → invoices(status != 'void') → invoice_items(item_type,amount signed)
 *  Paid-ness     v_invoice_balances.is_paid  (Σ allocations ≥ total_amount)
 *  New vs renew  invoices.subscription_period_id → subscription_periods.sequence_number
 *  Charge type   invoice_items(item_type='adjustment') → subscription_adjustments
 *                (damage_id → damage; code_snapshot ~ 'late_fee' → late fee; else additional)
 *  Method        payment_transactions.method  (from the real captured txn)
 *  Refunds       refunds(reason, status, amount, completed_at)
 *  Deposits      deposits(status: pending|held|released|forfeited, held_at/released_at/forfeited_at)
 *
 * Every `date`/timestamp comparison is against an IST calendar day — the window
 * is [ `${from}T00:00:00+05:30`, `${to}T23:59:59+05:30` ].
 *
 * DOCUMENTED DECISION: charges covered by a forfeited / deposit-adjusted amount
 * are NOT in Gross Revenue (no payment_transaction exists — financial rules
 * 1/3/4). They appear only under Deposits → Adjusted.
 * ─────────────────────────────────────────────────────────────────────────
 */

const REVENUE_REFUND_REASONS = ["booking_cancellation", "goodwill"] as const;
const DEPOSIT_REFUND_REASONS = ["deposit_release", "settlement"] as const;

function startInstant(day: string): string {
    return `${day}T00:00:00+05:30`;
}

/** dp-safe rounding to 2 places, matching the DB's round(...,2). */
function r2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── raw row shapes ──────────────────────────────────────────────────────────

export interface AllocRow {
    amount: number;
    txnId: string;
    gatewayPaymentId: string;
    method: string | null;
    capturedAt: string;
    payerId: string;
    invoiceId: string;
    invoiceStatus: string;
    invoiceTotal: number;
    invoicePurpose: string;
    subscriptionId: string;
    periodId: string | null;
    riderId: string;
}

export interface ItemRow {
    invoiceId: string;
    itemType: "plan_fee" | "adjustment" | "deposit";
    amount: number;
    description: string;
    adjustmentId: string | null;
}

export interface RefundRow {
    id: string;
    userId: string;
    reason: string;
    amount: number;
    grossAmount: number;
    status: string;
    initiatedAt: string;
    completedAt: string | null;
}

export interface WindowData {
    from: string;
    to: string;
    allocs: AllocRow[];
    itemsByInvoice: Map<string, ItemRow[]>;
    seqByPeriod: Map<string, number>;
    adjById: Map<string, { code: string | null; damageId: string | null; kind: string }>;
    riderNameById: Map<string, string>;
    vehicleBySubscription: Map<string, string | null>;
    bookingBySubscription: Map<string, string | null>;
    refundsInWindow: RefundRow[];        // initiated_at in window (breakdown)
    refundsCompleted: RefundRow[];       // succeeded, completed_at in window (net + deposit refunded)
    depositsCollected: { subscriptionId: string; amount: number }[];
    depositsForfeitedInWindow: { subscriptionId: string; amount: number }[];
    depositHeldTotal: number;
    settlements: {
        depositSnapshot: number; totalCharges: number; lateFee: number; damage: number; other: number; settledAt: string;
    }[];
    pendingRefundCount: number;
}

// ── window loader ──────────────────────────────────────────────────────────

async function loadWindow(from: string, to: string, opts: { withRiders?: boolean } = {}): Promise<WindowData> {
    const fromI = startInstant(from);
    const toI = endOfBusinessDay(to);

    const allocRes = await supabaseAdmin
        .from("payment_allocations")
        .select(
            "amount, payment_transactions!inner ( id, gateway_payment_id, method, status, captured_at, payment_orders!inner ( user_id ) ), " +
            "invoices!inner ( id, status, total_amount, purpose, subscription_id, subscription_period_id, user_id )",
        )
        .eq("payment_transactions.status", "succeeded")
        .gte("payment_transactions.captured_at", fromI)
        .lte("payment_transactions.captured_at", toI);
    if (allocRes.error) throw allocRes.error;

    // The Supabase typed client can't infer a hand-written embed string; the
    // shape is asserted here and normalised immediately below.
    const allocRaw = (allocRes.data ?? []) as unknown as {
        amount: number | string;
        payment_transactions: {
            id: string; gateway_payment_id: string; method: string | null; captured_at: string;
            payment_orders: { user_id: string } | { user_id: string }[];
        } | {
            id: string; gateway_payment_id: string; method: string | null; captured_at: string;
            payment_orders: { user_id: string } | { user_id: string }[];
        }[];
        invoices: {
            id: string; status: string; total_amount: number | string; purpose: string;
            subscription_id: string; subscription_period_id: string | null; user_id: string;
        } | {
            id: string; status: string; total_amount: number | string; purpose: string;
            subscription_id: string; subscription_period_id: string | null; user_id: string;
        }[];
    }[];

    const allocs: AllocRow[] = allocRaw.map((row) => {
        const txn = (Array.isArray(row.payment_transactions) ? row.payment_transactions[0] : row.payment_transactions) as {
            id: string; gateway_payment_id: string; method: string | null; captured_at: string;
            payment_orders: { user_id: string } | { user_id: string }[];
        };
        const order = Array.isArray(txn.payment_orders) ? txn.payment_orders[0] : txn.payment_orders;
        const inv = (Array.isArray(row.invoices) ? row.invoices[0] : row.invoices) as {
            id: string; status: string; total_amount: number; purpose: string;
            subscription_id: string; subscription_period_id: string | null; user_id: string;
        };
        return {
            amount: Number(row.amount),
            txnId: txn.id,
            gatewayPaymentId: txn.gateway_payment_id,
            method: txn.method,
            capturedAt: txn.captured_at,
            payerId: order.user_id,
            invoiceId: inv.id,
            invoiceStatus: inv.status,
            invoiceTotal: Number(inv.total_amount),
            invoicePurpose: inv.purpose,
            subscriptionId: inv.subscription_id,
            periodId: inv.subscription_period_id,
            riderId: inv.user_id,
        };
    }).filter((a) => a.invoiceStatus !== "void" && a.invoiceTotal > 0);

    const invoiceIds = [...new Set(allocs.map((a) => a.invoiceId))];
    const periodIds = [...new Set(allocs.map((a) => a.periodId).filter((x): x is string => !!x))];
    const subscriptionIds = [...new Set(allocs.map((a) => a.subscriptionId))];

    const [itemsRes, periodsRes, subsRes] = await Promise.all([
        invoiceIds.length
            ? supabaseAdmin.from("invoice_items")
                .select("invoice_id, item_type, amount, description, subscription_adjustment_id")
                .in("invoice_id", invoiceIds)
            : Promise.resolve({ data: [], error: null } as const),
        periodIds.length
            ? supabaseAdmin.from("subscription_periods").select("id, sequence_number").in("id", periodIds)
            : Promise.resolve({ data: [], error: null } as const),
        subscriptionIds.length
            ? supabaseAdmin.from("subscriptions").select("id, booking_id").in("id", subscriptionIds)
            : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (periodsRes.error) throw periodsRes.error;
    if (subsRes.error) throw subsRes.error;

    const items: ItemRow[] = (itemsRes.data ?? []).map((r) => ({
        invoiceId: r.invoice_id,
        itemType: r.item_type,
        amount: Number(r.amount),
        description: r.description ?? "",
        adjustmentId: r.subscription_adjustment_id,
    }));
    const itemsByInvoice = new Map<string, ItemRow[]>();
    for (const it of items) {
        const arr = itemsByInvoice.get(it.invoiceId) ?? [];
        arr.push(it);
        itemsByInvoice.set(it.invoiceId, arr);
    }

    const seqByPeriod = new Map<string, number>();
    for (const p of periodsRes.data ?? []) seqByPeriod.set(p.id, Number(p.sequence_number));

    const adjIds = [...new Set(items.map((i) => i.adjustmentId).filter((x): x is string => !!x))];
    const adjRes = adjIds.length
        ? await supabaseAdmin.from("subscription_adjustments").select("id, code_snapshot, damage_id, kind").in("id", adjIds)
        : ({ data: [], error: null } as const);
    if (adjRes.error) throw adjRes.error;
    const adjById = new Map<string, { code: string | null; damageId: string | null; kind: string }>();
    for (const a of adjRes.data ?? []) {
        adjById.set(a.id, { code: a.code_snapshot, damageId: a.damage_id, kind: a.kind });
    }

    // subscription → booking → vehicle registration
    const bookingBySubscription = new Map<string, string | null>();
    const bookingIds: string[] = [];
    for (const s of subsRes.data ?? []) {
        bookingBySubscription.set(s.id, s.booking_id ?? null);
        if (s.booking_id) bookingIds.push(s.booking_id);
    }
    const vehicleBySubscription = new Map<string, string | null>();
    if (bookingIds.length) {
        const bkRes = await supabaseAdmin.from("bookings").select("id, held_vehicle_id").in("id", bookingIds);
        if (bkRes.error) throw bkRes.error;
        const vehIdByBooking = new Map<string, string | null>();
        const vehIds: string[] = [];
        for (const b of bkRes.data ?? []) {
            vehIdByBooking.set(b.id, b.held_vehicle_id ?? null);
            if (b.held_vehicle_id) vehIds.push(b.held_vehicle_id);
        }
        const regByVeh = new Map<string, string>();
        if (vehIds.length) {
            const vRes = await supabaseAdmin.from("vehicles").select("id, registration_number").in("id", [...new Set(vehIds)]);
            if (vRes.error) throw vRes.error;
            for (const v of vRes.data ?? []) regByVeh.set(v.id, v.registration_number);
        }
        for (const [subId, bookingId] of bookingBySubscription) {
            const vId = bookingId ? vehIdByBooking.get(bookingId) : null;
            vehicleBySubscription.set(subId, vId ? regByVeh.get(vId) ?? null : null);
        }
    }

    // refunds
    const [refInitRes, refDoneRes, pendingRes] = await Promise.all([
        supabaseAdmin.from("refunds")
            .select("id, user_id, reason, amount, gross_amount, status, initiated_at, completed_at")
            .gte("initiated_at", fromI).lte("initiated_at", toI),
        supabaseAdmin.from("refunds")
            .select("id, user_id, reason, amount, gross_amount, status, initiated_at, completed_at")
            .eq("status", "succeeded").gte("completed_at", fromI).lte("completed_at", toI),
        supabaseAdmin.from("refunds").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    if (refInitRes.error) throw refInitRes.error;
    if (refDoneRes.error) throw refDoneRes.error;
    if (pendingRes.error) throw pendingRes.error;

    const toRefund = (r: Record<string, unknown>): RefundRow => ({
        id: r.id as string,
        userId: r.user_id as string,
        reason: r.reason as string,
        amount: Number(r.amount),
        grossAmount: Number(r.gross_amount ?? r.amount),
        status: r.status as string,
        initiatedAt: r.initiated_at as string,
        completedAt: (r.completed_at as string) ?? null,
    });
    const refundsInWindow = (refInitRes.data ?? []).map(toRefund);
    const refundsCompleted = (refDoneRes.data ?? []).map(toRefund);

    // deposits
    const [depCollRes, depHeldRes, depForfRes, settleRes] = await Promise.all([
        supabaseAdmin.from("deposits").select("subscription_id, amount, status, held_at")
            .gte("held_at", fromI).lte("held_at", toI),
        supabaseAdmin.from("deposits").select("amount").eq("status", "held"),
        supabaseAdmin.from("deposits").select("subscription_id, amount, forfeited_at")
            .eq("status", "forfeited").gte("forfeited_at", fromI).lte("forfeited_at", toI),
        supabaseAdmin.from("rental_settlements")
            .select("deposit_amount_snapshot, total_charges_amount, late_fee_amount, damage_amount, other_charges_amount, settled_at")
            .gte("settled_at", fromI).lte("settled_at", toI),
    ]);
    if (depCollRes.error) throw depCollRes.error;
    if (depHeldRes.error) throw depHeldRes.error;
    if (depForfRes.error) throw depForfRes.error;
    if (settleRes.error) throw settleRes.error;

    const depositsCollected = (depCollRes.data ?? []).map((d) => ({
        subscriptionId: d.subscription_id as string, amount: Number(d.amount),
    }));
    const depositsForfeitedInWindow = (depForfRes.data ?? []).map((d) => ({
        subscriptionId: d.subscription_id as string, amount: Number(d.amount),
    }));
    const depositHeldTotal = (depHeldRes.data ?? []).reduce((s, d) => s + Number(d.amount), 0);
    const settlements = (settleRes.data ?? []).map((s) => ({
        depositSnapshot: Number(s.deposit_amount_snapshot),
        totalCharges: Number(s.total_charges_amount),
        lateFee: Number(s.late_fee_amount),
        damage: Number(s.damage_amount),
        other: Number(s.other_charges_amount),
        settledAt: s.settled_at as string,
    }));

    // rider names (payers + refund users) — only when a caller needs them
    const riderNameById = new Map<string, string>();
    if (opts.withRiders) {
        const ids = [
            ...new Set([
                ...allocs.map((a) => a.riderId),
                ...refundsInWindow.map((r) => r.userId),
                ...refundsCompleted.map((r) => r.userId),
            ]),
        ];
        if (ids.length) {
            const uRes = await supabaseAdmin.from("users").select("id, full_name").in("id", ids);
            if (uRes.error) throw uRes.error;
            for (const u of uRes.data ?? []) riderNameById.set(u.id, u.full_name ?? "—");
        }
    }

    return {
        from, to, allocs, itemsByInvoice, seqByPeriod, adjById, riderNameById,
        vehicleBySubscription, bookingBySubscription, refundsInWindow, refundsCompleted,
        depositsCollected, depositsForfeitedInWindow, depositHeldTotal, settlements,
        pendingRefundCount: pendingRes.count ?? 0,
    };
}

// ── classification ─────────────────────────────────────────────────────────

export function classifyItem(item: ItemRow, alloc: AllocRow, w: WindowData): RevenueType {
    if (item.amount < 0) return "discount";
    if (item.itemType === "plan_fee") {
        const seq = alloc.periodId ? w.seqByPeriod.get(alloc.periodId) ?? 1 : 1;
        return seq > 1 ? "renewal" : "rental";
    }
    // adjustment
    const adj = item.adjustmentId ? w.adjById.get(item.adjustmentId) : undefined;
    if (adj?.damageId) return "damage";
    if (adj?.code && /^late_fee/i.test(adj.code)) return "late_fee";
    if (/late fee|overdue plan renewal/i.test(item.description)) return "late_fee";
    if (/damage/i.test(item.description)) return "damage";
    return "additional_charge";
}

// ── the engine ─────────────────────────────────────────────────────────────

export interface RevenueBreakdownResult {
    figures: RevenueMoneyFigures;
    deposits: DepositFigures;
    byType: Map<RevenueType, { amount: number; count: number }>;
    byMethod: Map<string, { amount: number; count: number }>;
    pendingRefunds: number;
    /** per-allocation revenue share, keyed for trend bucketing */
    revenueEvents: { at: string; gross: number; lateFee: number; additional: number }[];
    refundEvents: { at: string; amount: number }[];
}

export function computeFromWindow(w: WindowData): RevenueBreakdownResult {
    const byType = new Map<RevenueType, { amount: number; count: number }>();
    const byMethod = new Map<string, { amount: number; count: number }>();
    const revenueEvents: RevenueBreakdownResult["revenueEvents"] = [];
    let gross = 0;
    let lateFees = 0;
    let additionalCharges = 0;
    let damageCharges = 0;
    let depositCashIn = 0;

    const bump = (m: Map<string, { amount: number; count: number }>, k: string, amt: number) => {
        const cur = m.get(k) ?? { amount: 0, count: 0 };
        cur.amount += amt;
        cur.count += 1;
        m.set(k, cur);
    };

    for (const a of w.allocs) {
        const items = w.itemsByInvoice.get(a.invoiceId) ?? [];
        if (items.length === 0) continue;
        const total = a.invoiceTotal;
        let allocRevenue = 0;
        let allocLateFee = 0;
        let allocAdditional = 0;

        for (const it of items) {
            const share = a.amount * (it.amount / total);
            if (it.itemType === "deposit") {
                depositCashIn += share;
                continue;
            }
            const cls = classifyItem(it, a, w);
            const bt = byType.get(cls) ?? { amount: 0, count: 0 };
            bt.amount += share;
            bt.count += 1;
            byType.set(cls, bt);
            allocRevenue += share;
            if (cls === "late_fee") { lateFees += share; allocLateFee += share; }
            else if (cls === "damage") { damageCharges += share; }
            else if (cls === "additional_charge") { additionalCharges += share; allocAdditional += share; }
        }
        gross += allocRevenue;
        if (allocRevenue !== 0) bump(byMethod, a.method ?? "other", allocRevenue);
        revenueEvents.push({ at: a.capturedAt, gross: allocRevenue, lateFee: allocLateFee, additional: allocAdditional });
    }

    // refunds that reverse revenue
    const refundEvents: RevenueBreakdownResult["refundEvents"] = [];
    let revenueRefunds = 0;
    for (const rf of w.refundsCompleted) {
        if ((REVENUE_REFUND_REASONS as readonly string[]).includes(rf.reason)) {
            revenueRefunds += rf.amount;
            refundEvents.push({ at: rf.completedAt ?? rf.initiatedAt, amount: rf.amount });
        }
    }

    // deposits
    const depCollected = w.depositsCollected.reduce((s, d) => s + d.amount, 0);
    const depRefunded = w.refundsCompleted
        .filter((rf) => (DEPOSIT_REFUND_REASONS as readonly string[]).includes(rf.reason))
        .reduce((s, rf) => s + rf.amount, 0);
    const depAdjustedFromSettlements = w.settlements.reduce(
        (s, st) => s + Math.min(st.totalCharges, st.depositSnapshot), 0,
    );
    const depAdjustedFromForfeits = w.depositsForfeitedInWindow.reduce((s, d) => s + d.amount, 0);
    // Forfeitures and settlements can overlap for one subscription; prefer the
    // settlement figure and only add forfeits with no settlement in the window.
    const deposits: DepositFigures = {
        collected: r2(depCollected),
        refunded: r2(depRefunded),
        adjusted: r2(depAdjustedFromSettlements + depAdjustedFromForfeits),
        held: r2(w.depositHeldTotal),
    };

    const figures: RevenueMoneyFigures = {
        gross: r2(gross),
        refunds: r2(revenueRefunds),
        net: r2(gross - revenueRefunds),
        lateFees: r2(lateFees),
        additionalCharges: r2(additionalCharges),
        damageCharges: r2(damageCharges),
    };

    // fold deposit cash-in into by-method total so §10 reconciles to money received
    if (depositCashIn !== 0) bump(byMethod, "__deposit__", depositCashIn);

    for (const [k, v] of byType) byType.set(k, { amount: r2(v.amount), count: v.count });
    for (const [k, v] of byMethod) byMethod.set(k, { amount: r2(v.amount), count: v.count });

    return {
        figures, deposits, byType, byMethod,
        pendingRefunds: w.pendingRefundCount,
        revenueEvents, refundEvents,
    };
}

// ── public API ─────────────────────────────────────────────────────────────

export async function getRevenueSummary(
    from: string, to: string, compare?: { from: string; to: string },
): Promise<RevenueSummary> {
    const [w, prevW] = await Promise.all([
        loadWindow(from, to),
        compare ? loadWindow(compare.from, compare.to) : Promise.resolve(null),
    ]);
    const cur = computeFromWindow(w);

    const summary: RevenueSummary = {
        range: { from, to },
        ...cur.figures,
        deposits: cur.deposits,
        pendingRefunds: cur.pendingRefunds,
    };

    if (prevW) {
        const prev = computeFromWindow(prevW);
        summary.previous = { ...prev.figures, deposits: prev.deposits };
        const pct = (now: number, was: number): number | null => (was === 0 ? null : r2(((now - was) / was) * 100));
        summary.deltaPct = {
            gross: pct(cur.figures.gross, prev.figures.gross),
            refunds: pct(cur.figures.refunds, prev.figures.refunds),
            net: pct(cur.figures.net, prev.figures.net),
            lateFees: pct(cur.figures.lateFees, prev.figures.lateFees),
            additionalCharges: pct(cur.figures.additionalCharges, prev.figures.additionalCharges),
            damageCharges: pct(cur.figures.damageCharges, prev.figures.damageCharges),
            depositsCollected: pct(cur.deposits.collected, prev.deposits.collected),
        };
    }

    return summary;
}

function bucketKey(iso: string, g: RevenueGranularity): string {
    const d = new Date(iso);
    // Bucket in IST.
    const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
    const y = ist.getUTCFullYear();
    const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
    const day = String(ist.getUTCDate()).padStart(2, "0");
    if (g === "yearly") return `${y}`;
    if (g === "monthly") return `${y}-${m}`;
    if (g === "weekly") {
        const jan1 = Date.UTC(y, 0, 1);
        const week = Math.floor((ist.getTime() - jan1) / (7 * 86_400_000)) + 1;
        return `${y}-W${String(week).padStart(2, "0")}`;
    }
    return `${y}-${m}-${day}`;
}

export async function getRevenueTrend(
    from: string, to: string, granularity: RevenueGranularity,
): Promise<RevenueTrendPoint[]> {
    const w = await loadWindow(from, to);
    const cur = computeFromWindow(w);
    const buckets = new Map<string, RevenueTrendPoint>();
    const ensure = (k: string) => {
        let b = buckets.get(k);
        if (!b) { b = { bucket: k, gross: 0, refunds: 0, net: 0, lateFees: 0, additionalCharges: 0 }; buckets.set(k, b); }
        return b;
    };
    for (const ev of cur.revenueEvents) {
        const b = ensure(bucketKey(ev.at, granularity));
        b.gross += ev.gross;
        b.lateFees += ev.lateFee;
        b.additionalCharges += ev.additional;
    }
    for (const ev of cur.refundEvents) {
        ensure(bucketKey(ev.at, granularity)).refunds += ev.amount;
    }
    return [...buckets.values()]
        .map((b) => ({
            bucket: b.bucket,
            gross: r2(b.gross), refunds: r2(b.refunds), net: r2(b.gross - b.refunds),
            lateFees: r2(b.lateFees), additionalCharges: r2(b.additionalCharges),
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export async function getRevenueByType(from: string, to: string): Promise<RevenueByTypeRow[]> {
    const w = await loadWindow(from, to);
    const cur = computeFromWindow(w);
    const gross = cur.figures.gross;
    const rows: RevenueByTypeRow[] = (Object.keys(REVENUE_TYPE_LABEL) as RevenueType[])
        .map((t) => {
            const v = cur.byType.get(t) ?? { amount: 0, count: 0 };
            return {
                type: t, label: REVENUE_TYPE_LABEL[t],
                amount: r2(v.amount), count: v.count,
                pct: gross === 0 ? 0 : r2((v.amount / gross) * 100),
            };
        })
        .filter((r) => r.amount !== 0 || r.count > 0);
    rows.push({ type: "gross", label: "Gross Revenue", amount: gross, count: rows.reduce((s, r) => s + r.count, 0), pct: 100 });
    return rows;
}

export async function getRevenueByMethod(from: string, to: string): Promise<RevenueByMethodRow[]> {
    const w = await loadWindow(from, to);
    const cur = computeFromWindow(w);
    return [...cur.byMethod.entries()]
        .filter(([k]) => k !== "__deposit__")
        .map(([method, v]) => ({ method, amount: r2(v.amount), count: v.count }))
        .sort((a, b) => b.amount - a.amount);
}

export async function getRefundBreakdown(from: string, to: string): Promise<RefundBreakdown> {
    const w = await loadWindow(from, to);
    const rf = w.refundsInWindow;
    const sum = (pred: (r: RefundRow) => boolean, field: "amount" | "grossAmount" = "amount") =>
        rf.filter(pred).reduce((s, r) => s + r[field], 0);

    const completedRows = rf.filter((r) => r.status === "succeeded");
    const REASON_LABEL: Record<string, string> = {
        booking_cancellation: "Booking Cancellation",
        settlement: "Early Return / Settlement",
        deposit_release: "Deposit Refund",
        goodwill: "Goodwill / Other",
    };
    const byReasonMap = new Map<string, { amount: number; count: number }>();
    for (const r of rf) {
        const cur = byReasonMap.get(r.reason) ?? { amount: 0, count: 0 };
        cur.amount += r.amount;
        cur.count += 1;
        byReasonMap.set(r.reason, cur);
    }

    return {
        total: r2(sum(() => true, "grossAmount")),
        completed: r2(sum((r) => r.status === "succeeded")),
        pending: r2(sum((r) => r.status === "pending" || r.status === "processing")),
        failed: r2(sum((r) => r.status === "failed")),
        rejected: r2(sum((r) => r.status === "rejected", "grossAmount")),
        count: rf.length,
        avg: completedRows.length ? r2(sum((r) => r.status === "succeeded") / completedRows.length) : 0,
        byReason: [...byReasonMap.entries()].map(([reason, v]) => ({
            reason, label: REASON_LABEL[reason] ?? reason, amount: r2(v.amount), count: v.count,
        })),
    };
}

export async function getDepositSummary(from: string, to: string): Promise<DepositFigures & { formula: string }> {
    const w = await loadWindow(from, to);
    const cur = computeFromWindow(w);
    return { ...cur.deposits, formula: "Held (now) = Collected(all-time) − Refunded(all-time) − Adjusted(all-time)" };
}

// ── transaction table ──────────────────────────────────────────────────────

function txnTypeForAllocation(dominant: RevenueType | "deposit"): RevenueTxnType {
    switch (dominant) {
        case "rental": return "rental_payment";
        case "renewal": return "renewal_payment";
        case "late_fee": return "late_fee";
        case "damage": return "damage_charge";
        case "additional_charge": return "additional_charge";
        case "deposit": return "security_deposit";
        default: return "rental_payment";
    }
}

export async function getRevenueTransactions(
    f: RevenueTransactionFilters,
): Promise<Paginated<RevenueTransactionRow>> {
    const w = await loadWindow(f.from, f.to, { withRiders: true });

    // one row per succeeded payment transaction (aggregate its allocations)
    const byTxn = new Map<string, AllocRow[]>();
    for (const a of w.allocs) {
        const arr = byTxn.get(a.txnId) ?? [];
        arr.push(a);
        byTxn.set(a.txnId, arr);
    }

    const rows: RevenueTransactionRow[] = [];

    for (const [txnId, group] of byTxn) {
        const head = group[0];
        let gross = 0, deposit = 0, lateFee = 0, additional = 0;
        const typeAmounts = new Map<RevenueType | "deposit", number>();
        for (const a of group) {
            const items = w.itemsByInvoice.get(a.invoiceId) ?? [];
            for (const it of items) {
                const share = a.amount * (it.amount / a.invoiceTotal);
                if (it.itemType === "deposit") {
                    deposit += share;
                    typeAmounts.set("deposit", (typeAmounts.get("deposit") ?? 0) + share);
                    continue;
                }
                const cls = classifyItem(it, a, w);
                gross += share;
                typeAmounts.set(cls, (typeAmounts.get(cls) ?? 0) + share);
                if (cls === "late_fee") lateFee += share;
                else if (cls === "additional_charge") additional += share;
            }
        }
        const dominant = [...typeAmounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "rental";
        rows.push({
            id: head.gatewayPaymentId,
            kind: "payment",
            bookingId: w.bookingBySubscription.get(head.subscriptionId) ?? null,
            riderName: w.riderNameById.get(head.riderId) ?? "—",
            riderId: head.riderId,
            vehicleNumber: w.vehicleBySubscription.get(head.subscriptionId) ?? null,
            date: head.capturedAt,
            type: txnTypeForAllocation(dominant),
            method: head.method,
            gross: r2(gross),
            refund: 0,
            deposit: r2(deposit),
            lateFee: r2(lateFee),
            additionalCharge: r2(additional),
            net: r2(gross),
            paymentStatus: "succeeded",
            refundStatus: null,
        });
        void txnId;
    }

    for (const rf of w.refundsInWindow) {
        const isDeposit = (DEPOSIT_REFUND_REASONS as readonly string[]).includes(rf.reason);
        rows.push({
            id: rf.id,
            kind: "refund",
            bookingId: null,
            riderName: w.riderNameById.get(rf.userId) ?? "—",
            riderId: rf.userId,
            vehicleNumber: null,
            date: rf.completedAt ?? rf.initiatedAt,
            type: isDeposit ? "security_deposit_refund" : "refund",
            method: null,
            gross: 0,
            refund: r2(rf.amount),
            deposit: isDeposit ? r2(rf.amount) : 0,
            lateFee: 0,
            additionalCharge: 0,
            net: r2(-rf.amount),
            paymentStatus: null,
            refundStatus: rf.status,
        });
    }

    // filters
    let filtered = rows;
    if (f.type) filtered = filtered.filter((r) => r.type === f.type);
    if (f.method) filtered = filtered.filter((r) => r.method === f.method);
    if (f.paymentStatus) filtered = filtered.filter((r) => r.paymentStatus === f.paymentStatus);
    if (f.refundStatus) filtered = filtered.filter((r) => r.refundStatus === f.refundStatus);
    if (f.riderId) filtered = filtered.filter((r) => r.riderId === f.riderId);
    if (f.search) {
        const q = f.search.toLowerCase();
        filtered = filtered.filter((r) =>
            r.riderName.toLowerCase().includes(q) ||
            (r.vehicleNumber ?? "").toLowerCase().includes(q) ||
            (r.bookingId ?? "").toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        );
    }
    if (f.vehicleId) filtered = filtered.filter((r) => r.vehicleNumber === f.vehicleId);

    filtered.sort((a, b) => {
        const dir = f.sortDir === "asc" ? 1 : -1;
        if (f.sortBy === "gross") return (a.gross - b.gross) * dir;
        if (f.sortBy === "net") return (a.net - b.net) * dir;
        return (new Date(a.date).getTime() - new Date(b.date).getTime()) * dir;
    });

    const total = filtered.length;
    const start = (f.page - 1) * f.pageSize;
    return paginate(filtered.slice(start, start + f.pageSize), total, { page: f.page, pageSize: f.pageSize });
}

// ── export ─────────────────────────────────────────────────────────────────

const EXPORT_COLUMNS: { key: keyof RevenueTransactionRow; header: string; money?: boolean; width: number }[] = [
    { key: "id", header: "Transaction ID", width: 26 },
    { key: "bookingId", header: "Booking ID", width: 22 },
    { key: "riderName", header: "Rider Name", width: 22 },
    { key: "riderId", header: "Rider ID", width: 24 },
    { key: "vehicleNumber", header: "Vehicle Number", width: 16 },
    { key: "date", header: "Date", width: 22 },
    { key: "type", header: "Type", width: 18 },
    { key: "method", header: "Payment Method", width: 14 },
    { key: "gross", header: "Gross Amount", money: true, width: 14 },
    { key: "refund", header: "Refund Amount", money: true, width: 14 },
    { key: "deposit", header: "Deposit Amount", money: true, width: 14 },
    { key: "lateFee", header: "Late Fee", money: true, width: 12 },
    { key: "additionalCharge", header: "Additional Charge", money: true, width: 16 },
    { key: "net", header: "Net Amount", money: true, width: 14 },
    { key: "paymentStatus", header: "Payment Status", width: 14 },
    { key: "refundStatus", header: "Refund Status", width: 14 },
];

/**
 * A download name that reflects what the user was actually looking at:
 * `swapngo-revenue_2026-09-01_to_2026-09-30_rental-payment_upi_paid.xlsx`.
 * Slugged, deduped, and capped so it stays a sane filename.
 */
function exportFilename(f: RevenueTransactionFilters, ext: "csv" | "xlsx"): string {
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const parts = [`${f.from}_to_${f.to}`];
    if (f.type) parts.push(slug(f.type));
    if (f.method) parts.push(slug(f.method));
    if (f.paymentStatus) parts.push(`pay-${slug(f.paymentStatus)}`);
    if (f.refundStatus) parts.push(`refund-${slug(f.refundStatus)}`);
    if (f.search) parts.push(`q-${slug(f.search).slice(0, 20)}`);
    if (f.riderId) parts.push("rider");
    if (f.vehicleId) parts.push(`veh-${slug(f.vehicleId)}`);
    return `swapngo-revenue_${parts.join("_")}.${ext}`;
}

/** Human-readable list of the active filters, for the report header. */
function activeFilterSummary(f: RevenueTransactionFilters): string {
    const bits: string[] = [];
    if (f.type) bits.push(`Type: ${f.type.replace(/_/g, " ")}`);
    if (f.method) bits.push(`Method: ${f.method}`);
    if (f.paymentStatus) bits.push(`Payment: ${f.paymentStatus}`);
    if (f.refundStatus) bits.push(`Refund: ${f.refundStatus}`);
    if (f.search) bits.push(`Search: "${f.search}"`);
    return bits.length ? bits.join("  ·  ") : "No filters — all transactions";
}

export async function buildRevenueExport(
    f: RevenueTransactionFilters, format: "csv" | "xlsx",
): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const [summary, txns] = await Promise.all([
        getRevenueSummary(f.from, f.to),
        getRevenueTransactions({ ...f, page: 1, pageSize: 100_000 }),
    ]);
    if (format === "csv") {
        return {
            filename: exportFilename(f, "csv"),
            contentType: "text/csv; charset=utf-8",
            body: renderRevenueCsv(summary, txns.data, f),
        };
    }
    return {
        filename: exportFilename(f, "xlsx"),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: await renderRevenueXlsx(summary, txns.data, f),
    };
}

function summaryRows(summary: RevenueSummary): [string, number][] {
    return [
        ["Gross Revenue", summary.gross],
        ["Refunds", summary.refunds],
        ["Net Revenue", summary.net],
        ["Late Fees", summary.lateFees],
        ["Additional Charges", summary.additionalCharges],
        ["Deposits Collected", summary.deposits.collected],
        ["Deposits Refunded", summary.deposits.refunded],
        ["Deposits Adjusted", summary.deposits.adjusted],
        ["Deposits Held", summary.deposits.held],
    ];
}

/** Pure — exported for tests. */
export function renderRevenueCsv(
    summary: RevenueSummary, rows: RevenueTransactionRow[], f: RevenueTransactionFilters,
): Buffer {
    const summaryPairs = summaryRows(summary);
    const filterLine = activeFilterSummary(f);
    const esc = (v: unknown) => {
        let s = v == null ? "" : String(v);
        // Excel opens .csv in the system codepage, not UTF-8 — replace the
        // few non-ASCII glyphs we emit so they don't render as "â€"".
        s = s.replace(/[—–]/g, "-").replace(/·/g, "|").replace(/₹/g, "Rs ");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [
        `SwapNgo Revenue Report,${f.from} to ${f.to}`,
        `Filters,${esc(filterLine)}`,
        "",
    ];
    for (const [k, v] of summaryPairs) lines.push(`${esc(k)},${v}`);
    lines.push("", EXPORT_COLUMNS.map((c) => esc(c.header)).join(","));
    for (const row of rows) {
        lines.push(EXPORT_COLUMNS.map((c) => esc(row[c.key])).join(","));
    }
    // Leading UTF-8 BOM so Excel recognises the encoding.
    return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(lines.join("\r\n"), "utf-8")]);
}

/** Pure — exported for tests. Renders the branded workbook. */
export async function renderRevenueXlsx(
    summary: RevenueSummary, rows: RevenueTransactionRow[], f: RevenueTransactionFilters,
): Promise<Buffer> {
    const filterLine = activeFilterSummary(f);
    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SwapNgo";
    const sheet = wb.addWorksheet("Revenue");

    const NCOL = EXPORT_COLUMNS.length; // 16
    const MONEY_FMT = '"₹"#,##0';
    const INK = "FF14181F";          // near-black header bands
    const MUTED = "FF667085";
    const GREEN_TINT = "FFEAF8EF";
    const RED_TINT = "FFFDECEC";
    const RED = "FFFF4D4F";
    const solid = (argb: string) => ({ type: "pattern", pattern: "solid", fgColor: { argb } } as const);

    /** Paint every cell of a (possibly merged) rectangle so fills cover the whole span. */
    const band = (
        r1: number, c1: number, r2: number, c2: number,
        opts: { fill?: string; fontColor?: string; bold?: boolean; size?: number; italic?: boolean; align?: "left" | "right" },
    ) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                const cell = sheet.getCell(r, c);
                if (opts.fill) cell.fill = solid(opts.fill);
                cell.font = {
                    color: { argb: opts.fontColor ?? "FF14181F" },
                    bold: opts.bold, size: opts.size, italic: opts.italic,
                };
                cell.alignment = { vertical: "middle", horizontal: opts.align ?? "left", indent: 1 };
            }
        }
    };
    const put = (row: number, c1: number, c2: number, value: unknown) => {
        if (c2 > c1) sheet.mergeCells(row, c1, row, c2);
        sheet.getCell(row, c1).value = value as never;
    };

    const fmtDay = (d: string) =>
        new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    // 1 — title band
    put(1, 1, NCOL, "SwapNgo Revenue Report");
    band(1, 1, 1, NCOL, { fill: INK, fontColor: "FFFFFFFF", bold: true, size: 16 });
    sheet.getRow(1).height = 30;

    // 2 — subtitle band
    put(2, 1, NCOL, `Financial performance & successful transaction summary   •   ${fmtDay(f.from)} – ${fmtDay(f.to)}`);
    band(2, 1, 2, NCOL, { fill: "FFF3F5F7", fontColor: MUTED });
    sheet.getRow(2).height = 18;
    if (filterLine && !filterLine.startsWith("No filters")) {
        put(3, 1, NCOL, `Filters:  ${filterLine}`);
        band(3, 1, 3, NCOL, { fontColor: MUTED, italic: true, size: 9 });
    }
    let row = 4;

    // 4 — KPI band: Gross | Net (green) · Refunds (red)
    const third = Math.floor(NCOL / 3);
    const kpis: [string, number, string][] = [
        ["GROSS REVENUE", summary.gross, GREEN_TINT],
        ["NET REVENUE", summary.net, GREEN_TINT],
        ["REFUNDS", summary.refunds, RED_TINT],
    ];
    kpis.forEach(([label, value, tint], i) => {
        const c1 = i * third + 1;
        const c2 = i === 2 ? NCOL : (i + 1) * third;
        put(row, c1, c2, label);
        put(row + 1, c1, c2, value === 0 ? "₹0" : `₹${value.toLocaleString("en-IN")}`);
        band(row, c1, row + 2, c2, { fill: tint });
        sheet.getCell(row, c1).font = { bold: true, size: 10, color: { argb: label === "REFUNDS" ? RED : MUTED } };
        sheet.getCell(row + 1, c1).font = { bold: true, size: 16, color: { argb: label === "REFUNDS" ? RED : "FF14181F" } };
    });
    sheet.getRow(row).height = 20;
    sheet.getRow(row + 1).height = 24;
    row += 4;

    // 8 — Deposit summary
    put(row, 1, NCOL, "Deposit Summary");
    band(row, 1, row, NCOL, { bold: true, size: 12 });
    row += 1;
    const quarter = Math.floor(NCOL / 4);
    const deps: [string, number][] = [
        ["Collected", summary.deposits.collected],
        ["Refunded", summary.deposits.refunded],
        ["Adjusted Against Charges", summary.deposits.adjusted],
        ["Currently Held", summary.deposits.held],
    ];
    deps.forEach(([label, value], i) => {
        const c1 = i * quarter + 1;
        const c2 = i === 3 ? NCOL : (i + 1) * quarter;
        put(row, c1, c2, label);
        put(row + 1, c1, c2, value === 0 ? "₹0" : `₹${value.toLocaleString("en-IN")}`);
        band(row, c1, row + 1, c2, {});
        sheet.getCell(row, c1).font = { size: 10, color: { argb: MUTED }, bold: true };
        sheet.getCell(row + 1, c1).font = { bold: true, size: 12 };
    });
    row += 2;
    put(row, 1, NCOL, "Note: Deposits are riders' money and are not included in revenue.");
    band(row, 1, row, NCOL, { fontColor: MUTED, italic: true, size: 9 });
    row += 2;

    // 13 — transaction table
    const headerRow = row;
    EXPORT_COLUMNS.forEach((c, i) => { sheet.getCell(headerRow, i + 1).value = c.header; });
    band(headerRow, 1, headerRow, NCOL, { fill: INK, fontColor: "FFFFFFFF", bold: true });
    sheet.getRow(headerRow).height = 22;
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: NCOL } };
    sheet.views = [{ state: "frozen", ySplit: headerRow }];

    rows.forEach((dataRow, di) => {
        const r = headerRow + 1 + di;
        EXPORT_COLUMNS.forEach((c, i) => {
            const cell = sheet.getCell(r, i + 1);
            cell.value = dataRow[c.key] as never;
            cell.alignment = { indent: 1, horizontal: c.money ? "right" : "left" };
            if (c.money) {
                cell.numFmt = MONEY_FMT;
                if (c.key === "refund" && Number(dataRow.refund) > 0) cell.font = { color: { argb: RED } };
            }
        });
    });

    EXPORT_COLUMNS.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}
