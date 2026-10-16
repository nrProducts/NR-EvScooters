import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate } from "../../common/pagination";
import { Paginated } from "../../types";
import { DepositRow, DepositStatus } from "../deposits/deposits.types";
import { getDepositForSubscriptionOrNull, listDeposits } from "../deposits/deposits.service";
import {
    attachApprovers, chainOf, REFUND_COLUMNS, RawRefundRow, toRefundRow,
} from "./refunds.service";
import {
    DepositJourney, JourneyDamage, JourneyInvoice, JourneyPayment, JourneyRental,
    JourneyTimelineEvent, RefundRow,
} from "./refunds.types";

/**
 * The deposit journey — one deposit, from the rider's payment to the last
 * rupee going back (or being kept), in the order it happened.
 *
 * Staff were reading this off four screens (Payments, Deposits, Returns,
 * Refunds) and stitching the dates together by hand. Everything here already
 * exists as its own row; this only joins it and orders it.
 *
 * Read in batches (`IN (...)` per table, once per page) rather than per
 * deposit, so a page of eight journeys is a fixed handful of queries.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;
const one = <T,>(raw: unknown): T | null =>
    ((Array.isArray(raw) ? raw[0] : raw) ?? null) as T | null;
const many = <T,>(raw: unknown): T[] =>
    raw == null ? [] : (Array.isArray(raw) ? raw : [raw]) as T[];

interface RawSubscription {
    id: string;
    status: string;
    started_on: string;
    ended_at: string | null;
    plan_price_snapshot: number | string;
    deposit_amount_snapshot: number | string;
    duration_days_snapshot: number;
    billing_period_snapshot: string;
    users: unknown;
    bookings: unknown;
}

interface RawInvoice {
    id: string;
    subscription_id: string;
    invoice_number: string;
    purpose: string;
    status: string;
    issued_on: string | null;
    due_on: string | null;
    total_amount: number | string;
}

interface RawAllocation {
    invoice_id: string;
    amount: number | string;
    payment_transactions: unknown;
}

interface RawRental {
    id: string;
    subscription_id: string;
    picked_up_at: string;
    due_back_at: string;
    returned_at: string | null;
    end_reason: string | null;
    rental_returns: unknown;
    rental_settlements: unknown;
    rental_vehicle_assignments: unknown;
}

interface RawDamage {
    id: string;
    assessed_amount: number | string;
    status: string;
    notes: string | null;
    created_at: string;
    incidents: unknown;
}

const SUBSCRIPTION_COLUMNS = `
    id, status, started_on, ended_at, plan_price_snapshot, deposit_amount_snapshot,
    duration_days_snapshot, billing_period_snapshot,
    users(id, full_name, phone, email),
    bookings(
        id, requested_start_on, onboarding_charge_snapshot,
        plans(name, vehicle_models(name)),
        hubs(name)
    )
`;

const RENTAL_COLUMNS = `
    id, subscription_id, picked_up_at, due_back_at, returned_at, end_reason,
    rental_returns(
        status, requested_at, requested_reason, inspected_at, inspection_notes,
        approved_at, rejected_at, rejection_reason, other_charges_amount, payment_verified_at
    ),
    rental_settlements(
        settled_at, deposit_amount_snapshot, late_fee_amount, damage_amount,
        other_charges_amount, total_charges_amount, net_amount, outcome
    ),
    rental_vehicle_assignments(
        assigned_at, released_at, vehicles(display_name, registration_number)
    )
`;

/** Money-in-and-out totals for one deposit, so the summary never has to add things up in the browser. */
function computeTotals(
    deposit: DepositRow,
    payments: JourneyPayment[],
    refunds: RefundRow[],
    damages: JourneyDamage[],
) {
    const collected = round2(payments.reduce((s, p) => s + p.amount, 0));
    const refunded = round2(
        refunds.filter((r) => r.status === "succeeded").reduce((s, r) => s + r.amount, 0),
    );
    const inFlight = round2(
        refunds.filter((r) => r.status === "pending" || r.status === "processing")
            .reduce((s, r) => s + r.amount, 0),
    );
    const damageTotal = round2(
        damages.filter((d) => d.status !== "waived").reduce((s, d) => s + d.amount, 0),
    );
    return {
        collected,
        deposit_amount: deposit.amount,
        onboarding_charge: deposit.onboarding_charge_amount,
        damage_total: damageTotal,
        refunded,
        refund_in_flight: inFlight,
        // What the business keeps of the deposit: all of it when forfeited,
        // otherwise whatever has not gone (or is not on its way) back.
        retained: deposit.status === "forfeited"
            ? deposit.amount
            : deposit.status === "released"
                ? round2(Math.max(0, deposit.amount - refunded))
                : 0,
    };
}

function buildTimeline(
    deposit: DepositRow,
    payments: JourneyPayment[],
    rentals: JourneyRental[],
    damages: JourneyDamage[],
    refunds: RefundRow[],
): JourneyTimelineEvent[] {
    const events: JourneyTimelineEvent[] = [];
    // Most stamps are nullable columns; an event with no time simply did not happen.
    const push = (e: Omit<JourneyTimelineEvent, "at"> & { at: string | null }) => {
        if (e.at) events.push({ ...e, at: e.at });
    };

    for (const p of payments) {
        push({
            at: p.captured_at, kind: "payment", tone: "success",
            title: `Payment received — ₹${p.amount}`,
            detail: [p.method ? `via ${p.method.toUpperCase()}` : null, p.gateway_payment_id]
                .filter(Boolean).join(" · "),
            amount: p.amount,
        });
    }

    push({
        at: deposit.held_at, kind: "deposit", tone: "info",
        title: `Security deposit held — ₹${deposit.amount}`,
        detail: deposit.onboarding_charge_amount > 0
            ? `Onboarding charge of ₹${deposit.onboarding_charge_amount} collected alongside is non-refundable.`
            : null,
        amount: deposit.amount,
    });

    for (const r of rentals) {
        push({
            at: r.picked_up_at, kind: "rental", tone: "info",
            title: "Scooter picked up",
            detail: [
                r.vehicle ? `${r.vehicle.name} (${r.vehicle.registration_number})` : null,
                `due back ${r.due_back_at}`,
            ].filter(Boolean).join(" · "),
        });
        const ret = r.return;
        if (ret) {
            push({ at: ret.requested_at, kind: "return", tone: "info", title: "Return requested", detail: ret.requested_reason });
            push({ at: ret.inspected_at, kind: "return", tone: "info", title: "Scooter inspected", detail: ret.inspection_notes });
            push({
                at: ret.payment_verified_at, kind: "return", tone: "success",
                title: "Return payment verified",
                detail: ret.other_charges_amount > 0 ? `Other charges ₹${ret.other_charges_amount}` : null,
            });
            push({ at: ret.rejected_at, kind: "return", tone: "danger", title: "Return rejected", detail: ret.rejection_reason });
            push({ at: ret.approved_at, kind: "return", tone: "success", title: "Return approved", detail: null });
        }
        push({ at: r.returned_at, kind: "rental", tone: "info", title: "Scooter returned", detail: r.end_reason });

        const s = r.settlement;
        if (s) {
            const parts = [
                `deposit ₹${s.deposit_amount}`,
                s.late_fee_amount > 0 ? `late fee ₹${s.late_fee_amount}` : null,
                s.damage_amount > 0 ? `damage ₹${s.damage_amount}` : null,
                s.other_charges_amount > 0 ? `other ₹${s.other_charges_amount}` : null,
            ].filter(Boolean).join(" · ");
            push({
                at: s.settled_at, kind: "settlement",
                tone: s.outcome === "amount_due" ? "warning" : "info",
                title: s.outcome === "refund_due"
                    ? `Settled — ₹${s.net_amount} back to rider`
                    : s.outcome === "amount_due"
                        ? `Settled — rider owes ₹${Math.abs(s.net_amount)}`
                        : "Settled — nothing owed either way",
                detail: parts,
                amount: s.net_amount,
            });
        }
    }

    for (const d of damages) {
        push({
            at: d.created_at, kind: "damage", tone: d.status === "waived" ? "muted" : "warning",
            title: `Damage assessed — ₹${d.amount}`,
            detail: [d.status, d.notes].filter(Boolean).join(" · "),
            amount: d.amount,
        });
    }

    push({
        at: deposit.forfeited_at, kind: "deposit", tone: "danger",
        title: `Deposit forfeited — ₹${deposit.amount}`,
        detail: deposit.forfeit_reason,
        amount: deposit.amount,
    });

    if (deposit.refund_eligible_at) {
        push({
            // A DATE: shown at the start of that day.
            at: `${deposit.refund_eligible_at}T00:00:00+05:30`, kind: "deposit", tone: "info",
            title: "Refund becomes eligible",
            detail: "End of the post-return holding period.",
        });
    }

    for (const f of refunds) {
        const label = f.refund_type === "booking_cancellation" ? "Cancellation refund"
            : f.refund_type === "settlement" ? "Settlement refund"
                : f.refund_type === "goodwill" ? "Goodwill refund" : "Deposit refund";
        push({ at: f.initiated_at, kind: "refund", tone: "info", title: `${label} initiated — ₹${f.gross_amount}`, detail: null, amount: f.gross_amount });
        push({
            at: f.reviewed_at, kind: "refund", tone: "info",
            title: f.deduction_total > 0
                ? `Reviewed — ₹${f.deduction_total} withheld, ₹${f.amount} payable`
                : `Reviewed — ₹${f.amount} payable`,
            detail: [f.reviewed_by?.full_name ? `by ${f.reviewed_by.full_name}` : null, f.review_note]
                .filter(Boolean).join(" · "),
            amount: f.amount,
        });
        push({
            at: f.rejected_at, kind: "refund", tone: "danger", title: `${label} rejected`,
            detail: [f.rejected_by?.full_name ? `by ${f.rejected_by.full_name}` : null, f.rejection_reason]
                .filter(Boolean).join(" · "),
        });
        if (f.last_attempted_at) {
            push({
                at: f.last_attempted_at, kind: "refund",
                tone: f.status === "failed" ? "danger" : "info",
                title: f.status === "failed"
                    ? `Payout failed (attempt ${f.attempt_count})`
                    : `Payout submitted (attempt ${f.attempt_count})`,
                detail: f.status === "failed" ? f.failure_reason : f.gateway_refund_id,
            });
        }
        push({
            at: f.processed_at, kind: "refund", tone: "success",
            title: `Refund paid — ₹${f.amount}`,
            detail: f.gateway_refund_id,
            amount: f.amount,
        });
    }

    push({
        at: deposit.refunded_at, kind: "deposit", tone: "success",
        title: "Deposit released", detail: null,
    });

    return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Journeys for the given deposits, same order as `deposits`. */
async function buildJourneys(deposits: DepositRow[]): Promise<DepositJourney[]> {
    if (deposits.length === 0) return [];
    const subscriptionIds = deposits.map((d) => d.subscription_id);

    const [subsRes, invoicesRes, rentalsRes] = await Promise.all([
        supabaseAdmin.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("id", subscriptionIds),
        supabaseAdmin
            .from("invoices")
            .select("id, subscription_id, invoice_number, purpose, status, issued_on, due_on, total_amount")
            .in("subscription_id", subscriptionIds),
        supabaseAdmin.from("rentals").select(RENTAL_COLUMNS).in("subscription_id", subscriptionIds),
    ]);
    if (subsRes.error) throw subsRes.error;
    if (invoicesRes.error) throw invoicesRes.error;
    if (rentalsRes.error) throw rentalsRes.error;

    const invoices = (invoicesRes.data ?? []) as unknown as RawInvoice[];
    const rentals = (rentalsRes.data ?? []) as unknown as RawRental[];
    const invoiceIds = invoices.map((i) => i.id);
    const rentalIds = rentals.map((r) => r.id);

    const [allocRes, damageRes] = await Promise.all([
        invoiceIds.length
            ? supabaseAdmin
                .from("payment_allocations")
                .select(`
                    invoice_id, amount,
                    payment_transactions(
                        id, gateway_payment_id, amount, method, status, captured_at,
                        payment_orders(gateway_order_id, gateway)
                    )
                `)
                .in("invoice_id", invoiceIds)
            : Promise.resolve({ data: [], error: null }),
        rentalIds.length
            ? supabaseAdmin
                .from("damages")
                .select("id, assessed_amount, status, notes, created_at, incidents!inner(rental_id, description)")
                .in("incidents.rental_id", rentalIds)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (allocRes.error) throw allocRes.error;
    if (damageRes.error) throw damageRes.error;

    const allocations = (allocRes.data ?? []) as unknown as RawAllocation[];
    const damagesRaw = (damageRes.data ?? []) as unknown as RawDamage[];

    const transactionIds = [...new Set(
        allocations.map((a) => one<{ id: string }>(a.payment_transactions)?.id).filter((x): x is string => !!x),
    )];
    const { data: refundData, error: refundError } = transactionIds.length
        ? await supabaseAdmin
            .from("refunds")
            .select(REFUND_COLUMNS)
            .in("payment_transaction_id", transactionIds)
            .order("created_at", { ascending: true })
        : { data: [], error: null };
    if (refundError) throw refundError;
    const refundRows = (refundData ?? []) as unknown as RawRefundRow[];

    const allRefunds = await attachApprovers(refundRows.map((r) => toRefundRow(r)));
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));

    return deposits.map((deposit): DepositJourney => {
        const sub = ((subsRes.data ?? []) as unknown as RawSubscription[])
            .find((s) => s.id === deposit.subscription_id);
        const rider = one<{ id: string; full_name: string; phone: string | null; email: string | null }>(sub?.users);
        const booking = one<{
            id: string; requested_start_on: string | null; onboarding_charge_snapshot: number | string | null;
            plans: unknown; hubs: unknown;
        }>(sub?.bookings);
        const plan = one<{ name: string; vehicle_models: unknown }>(booking?.plans);

        const subInvoices = invoices.filter((i) => i.subscription_id === deposit.subscription_id);
        const subInvoiceIds = new Set(subInvoices.map((i) => i.id));

        // One row per CAPTURED payment, listing every invoice it paid.
        const byTxn = new Map<string, JourneyPayment>();
        for (const a of allocations) {
            if (!subInvoiceIds.has(a.invoice_id)) continue;
            const t = one<{
                id: string; gateway_payment_id: string; amount: number | string; method: string | null;
                status: string; captured_at: string; payment_orders: unknown;
            }>(a.payment_transactions);
            if (!t) continue;
            const inv = invoiceById.get(a.invoice_id);
            const order = one<{ gateway_order_id: string | null; gateway: string }>(t.payment_orders);
            const entry = byTxn.get(t.id) ?? {
                transaction_id: t.id,
                gateway_payment_id: t.gateway_payment_id,
                gateway_order_id: order?.gateway_order_id ?? null,
                gateway: order?.gateway ?? "razorpay",
                amount: Number(t.amount),
                method: (t.method as JourneyPayment["method"]) ?? null,
                status: t.status,
                captured_at: t.captured_at,
                invoices: [],
            };
            entry.invoices.push({
                invoice_id: a.invoice_id,
                invoice_number: inv?.invoice_number ?? "—",
                purpose: inv?.purpose ?? "—",
                allocated_amount: Number(a.amount),
            });
            byTxn.set(t.id, entry);
        }
        const payments = [...byTxn.values()]
            .filter((p) => p.status === "succeeded")
            .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
        const paymentIds = new Set(payments.map((p) => p.transaction_id));

        const journeyInvoices: JourneyInvoice[] = subInvoices
            .filter((i) => i.status !== "draft")
            .map((i) => ({
                id: i.id, invoice_number: i.invoice_number, purpose: i.purpose, status: i.status,
                issued_on: i.issued_on, due_on: i.due_on, total_amount: Number(i.total_amount),
            }))
            .sort((a, b) => (a.issued_on ?? "").localeCompare(b.issued_on ?? ""));

        const journeyRentals: JourneyRental[] = rentals
            .filter((r) => r.subscription_id === deposit.subscription_id)
            .map((r) => {
                const ret = one<{
                    status: string; requested_at: string | null; requested_reason: string | null;
                    inspected_at: string | null; inspection_notes: string | null; approved_at: string | null;
                    rejected_at: string | null; rejection_reason: string | null;
                    other_charges_amount: number | string | null; payment_verified_at: string | null;
                }>(r.rental_returns);
                const st = one<{
                    settled_at: string; deposit_amount_snapshot: number | string; late_fee_amount: number | string;
                    damage_amount: number | string; other_charges_amount: number | string;
                    total_charges_amount: number | string; net_amount: number | string; outcome: string;
                }>(r.rental_settlements);
                const assignments = many<{
                    assigned_at: string; released_at: string | null; vehicles: unknown;
                }>(r.rental_vehicle_assignments).sort((a, b) => a.assigned_at.localeCompare(b.assigned_at));
                const latest = assignments[assignments.length - 1];
                const vehicle = one<{ display_name: string | null; registration_number: string }>(latest?.vehicles);
                return {
                    id: r.id,
                    picked_up_at: r.picked_up_at,
                    due_back_at: r.due_back_at,
                    returned_at: r.returned_at,
                    end_reason: r.end_reason,
                    vehicle: vehicle
                        ? { name: vehicle.display_name ?? "Scooter", registration_number: vehicle.registration_number }
                        : null,
                    return: ret ? {
                        status: ret.status,
                        requested_at: ret.requested_at,
                        requested_reason: ret.requested_reason,
                        inspected_at: ret.inspected_at,
                        inspection_notes: ret.inspection_notes,
                        approved_at: ret.approved_at,
                        rejected_at: ret.rejected_at,
                        rejection_reason: ret.rejection_reason,
                        other_charges_amount: Number(ret.other_charges_amount ?? 0),
                        payment_verified_at: ret.payment_verified_at,
                    } : null,
                    settlement: st ? {
                        settled_at: st.settled_at,
                        deposit_amount: Number(st.deposit_amount_snapshot),
                        late_fee_amount: Number(st.late_fee_amount),
                        damage_amount: Number(st.damage_amount),
                        other_charges_amount: Number(st.other_charges_amount),
                        total_charges: Number(st.total_charges_amount),
                        net_amount: Number(st.net_amount),
                        outcome: st.outcome as "refund_due" | "amount_due" | "balanced",
                    } : null,
                };
            })
            .sort((a, b) => a.picked_up_at.localeCompare(b.picked_up_at));

        const rentalIdSet = new Set(journeyRentals.map((r) => r.id));
        const journeyDamages: JourneyDamage[] = damagesRaw
            .filter((d) => rentalIdSet.has(one<{ rental_id: string }>(d.incidents)?.rental_id ?? ""))
            .map((d) => ({
                id: d.id,
                amount: Number(d.assessed_amount),
                status: d.status,
                notes: d.notes ?? one<{ description: string }>(d.incidents)?.description ?? null,
                created_at: d.created_at,
            }));

        const refunds = allRefunds
            .filter((r) => paymentIds.has(r.payment_transaction_id))
            .map((r) => ({ ...r, deposit_id: deposit.id }));

        return {
            id: deposit.id,
            deposit,
            rider: rider ? { id: rider.id, full_name: rider.full_name, phone: rider.phone, email: rider.email } : null,
            subscription: {
                id: deposit.subscription_id,
                status: sub?.status ?? "—",
                started_on: sub?.started_on ?? null,
                ended_at: sub?.ended_at ?? null,
                plan_name: plan?.name ?? null,
                vehicle_model_name: one<{ name: string }>(plan?.vehicle_models)?.name ?? deposit.vehicle_model_name,
                hub_name: one<{ name: string }>(booking?.hubs)?.name ?? null,
                plan_price: Number(sub?.plan_price_snapshot ?? 0),
                deposit_amount: Number(sub?.deposit_amount_snapshot ?? deposit.amount),
                duration_days: sub?.duration_days_snapshot ?? null,
                billing_period: sub?.billing_period_snapshot ?? null,
                booking_id: booking?.id ?? deposit.booking_id,
                booking_start_on: booking?.requested_start_on ?? null,
            },
            payments,
            invoices: journeyInvoices,
            rentals: journeyRentals,
            damages: journeyDamages,
            refunds,
            totals: computeTotals(deposit, payments, refunds, journeyDamages),
            timeline: buildTimeline(deposit, payments, journeyRentals, journeyDamages, refunds),
        };
    });
}

export async function listDepositJourneys(filters: {
    page: number; pageSize: number; status?: DepositStatus;
}): Promise<Paginated<DepositJourney>> {
    const deposits = await listDeposits(filters);
    const journeys = await buildJourneys(deposits.data);
    return paginate(journeys, deposits.pagination.total, filters);
}

export async function getDepositJourneyBySubscription(subscriptionId: string): Promise<DepositJourney> {
    const deposit = await getDepositForSubscriptionOrNull(subscriptionId);
    if (!deposit) throw notFound("No deposit found for this subscription.");
    const [journey] = await buildJourneys([deposit]);
    return journey;
}

/** From a refund id — the Refunds table's row click. */
export async function getDepositJourneyByRefund(refundId: string): Promise<DepositJourney> {
    const { data, error } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("id", refundId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Refund not found.");
    const { subscription } = chainOf(data as unknown as RawRefundRow);
    if (!subscription) throw notFound("This refund is not linked to a subscription.");
    return getDepositJourneyBySubscription(subscription.id);
}
