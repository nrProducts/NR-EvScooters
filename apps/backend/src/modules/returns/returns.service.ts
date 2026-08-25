import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import {
    completeRide, computeLateReturnPenalty, effectiveDueAt, getRentalById,
} from "../rentals/rentals.service";
import { getSettings as getReturnRecoverySettings } from "../return-recovery-settings/return-recovery-settings.service";
import { recordDamage } from "../damages/damages.service";
import { getDepositForSubscriptionOrNull } from "../deposits/deposits.service";
import { processRefund } from "../refunds/refunds.service";
import { businessToday } from "../../common/dates";
import {
    ApproveReturnSettlementInput, ListSettlementsFilters, ReturnDetailView,
    ReturnSettlementRow, ReturnSettlementStatus,
} from "./returns.types";

/**
 * Return review and settlement.
 *
 * The orchestration is unchanged in shape — record damages, close the rental,
 * work out who owes whom, then refund or invoice — but the settlement row
 * itself is written by `completeRide` now rather than here.
 *
 * That is deliberate. `rental_settlements` is one row per rental with a
 * database-enforced arithmetic check, so it cannot be written twice; and a
 * plain completeRide (no damage review) has to produce a valid settlement too.
 * Putting the insert in one place means both paths agree by construction
 * instead of by inspection. This function's remaining job is the review — the
 * damage items and ad-hoc charges that only the full flow knows about — and
 * then the money movement the settlement implies.
 */

const SETTLEMENT_COLUMNS = `
    rental_id, settled_at, deposit_amount_snapshot, late_fee_amount, damage_amount,
    other_charges_amount, total_charges_amount, net_amount, outcome,
    refund_id, invoice_id, created_at,
    settled_by:users!settled_by_user_id(id, full_name),
    rentals(user_id, subscriptions(booking_id)),
    refunds(status)
`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawSettlementRow {
    rental_id: string;
    settled_at: string;
    deposit_amount_snapshot: number | string;
    late_fee_amount: number | string;
    damage_amount: number | string;
    other_charges_amount: number | string;
    total_charges_amount: number | string;
    net_amount: number | string;
    outcome: "refund_due" | "amount_due" | "balanced";
    refund_id: string | null;
    invoice_id: string | null;
    created_at: string;
    settled_by: unknown;
    rentals: unknown;
    refunds: unknown;
}

/**
 * Rebuilds the old six-value `status` from the outcome plus the refund's own
 * status — the two facts the single column used to conflate.
 */
function toStatus(
    outcome: RawSettlementRow["outcome"],
    refundStatus: string | null,
): ReturnSettlementStatus {
    if (outcome === "amount_due") return "amount_due";
    if (outcome === "balanced") return "settlement_completed";
    if (!refundStatus) return "no_refund_required";
    if (refundStatus === "succeeded") return "refund_completed";
    if (refundStatus === "processing") return "refund_processing";
    return "pending_refund";
}

function toSettlementRow(row: RawSettlementRow): ReturnSettlementRow {
    const rental = unwrap<{ user_id: string; subscriptions: unknown }>(row.rentals);
    const subscription = rental ? unwrap<{ booking_id: string }>(rental.subscriptions) : null;
    const refund = unwrap<{ status: string }>(row.refunds);
    const net = Number(row.net_amount);

    return {
        // The table is keyed by rental_id — there is no separate settlement id.
        id: row.rental_id,
        rental_id: row.rental_id,
        booking_id: subscription?.booking_id ?? null,
        user_id: rental?.user_id ?? "",
        // Which vehicle came back is the assignment's business, not the
        // settlement's; the Return Detail page reads it off the rental.
        vehicle_id: null,
        deposit_amount: Number(row.deposit_amount_snapshot),
        late_fee_amount: Number(row.late_fee_amount),
        damage_fee_amount: Number(row.damage_amount),
        other_charges: [],
        other_charges_amount: Number(row.other_charges_amount),
        total_charges: Number(row.total_charges_amount),
        net_settlement: net,
        refund_amount: Math.max(0, net),
        due_amount: Math.max(0, -net),
        status: toStatus(row.outcome, refund?.status ?? null),
        refund_id: row.refund_id,
        due_invoice_id: row.invoice_id,
        processed_by: unwrap<{ id: string; full_name: string }>(row.settled_by),
        created_at: row.created_at,
        processed_at: row.settled_at,
    };
}

async function getSettlementByRentalId(rentalId: string): Promise<ReturnSettlementRow | null> {
    const { data, error } = await supabaseAdmin
        .from("rental_settlements")
        .select(SETTLEMENT_COLUMNS)
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (error) throw error;
    return data ? toSettlementRow(data as unknown as RawSettlementRow) : null;
}

/** Everything the admin Return Detail page needs in one call. */
export async function getReturnDetail(rentalId: string): Promise<ReturnDetailView> {
    const rental = await getRentalById(rentalId);

    const { data: raw, error } = await supabaseAdmin
        .from("rentals")
        .select("subscription_id, due_back_at, rental_returns(due_back_at, status)")
        .eq("id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!raw) throw notFound("Rental not found.");

    const deposit = await getDepositForSubscriptionOrNull(raw.subscription_id);

    // Damage hangs off the incident now, so this is a join rather than a
    // `booking_id` filter — and it is scoped to THIS rental, which the old
    // booking-level filter was not.
    const { data: damageRows, error: damageError } = await supabaseAdmin
        .from("damages")
        .select(`
            id, assessed_amount, assessed_at, notes, status, created_at,
            assessed_by:users!assessed_by_user_id(id, full_name),
            incidents!inner(id, rental_id, description, photo_paths, reported_at, vehicle_id)
        `)
        .eq("incidents.rental_id", rentalId)
        .order("created_at", { ascending: true });
    if (damageError) throw damageError;

    const openReturn = (Array.isArray(raw.rental_returns) ? raw.rental_returns : [])
        .find((r) => r.status === "requested" || r.status === "inspected");

    const { max_late_fee_days, late_fee_per_day } = await getReturnRecoverySettings();
    const latePreview = computeLateReturnPenalty({
        returnDueAt: effectiveDueAt({
            return_due_at: openReturn?.due_back_at ?? null,
            expires_at: raw.due_back_at,
        }),
        maxDays: max_late_fee_days,
        // The same rate settleReturn will charge at.
        feePerDay: late_fee_per_day,
    });

    return {
        rental,
        deposit,
        damages: (damageRows ?? []) as unknown as ReturnDetailView["damages"],
        latePreview: {
            daysLate: latePreview.daysLate,
            penaltyAmount: latePreview.penaltyAmount,
            feePerDay: latePreview.feePerDay,
        },
        settlement: await getSettlementByRentalId(rentalId),
    };
}

/**
 * The full return-approval + settlement flow.
 *
 * Order matters and has not changed: damages are recorded FIRST so that
 * `completeRide`'s settlement picks them up when it sums the rental's
 * non-disputed damage. Then the rental closes and the settlement row is
 * written, arithmetic checked by the database. Only then does money move.
 */
export async function approveReturnSettlement(
    rentalId: string,
    input: ApproveReturnSettlementInput,
    actor: AuthContext,
): Promise<ReturnSettlementRow> {
    const { data: before, error: beforeError } = await supabaseAdmin
        .from("rentals")
        .select("id, user_id, status, subscription_id, rental_returns(status)")
        .eq("id", rentalId)
        .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw notFound("Rental not found.");
    if (before.status !== "active") throw businessRule("This ride is not active.");

    const hasOpenReturn = (Array.isArray(before.rental_returns) ? before.rental_returns : [])
        .some((r) => r.status === "requested" || r.status === "inspected");
    if (!hasOpenReturn) throw businessRule("No return has been requested for this rental.");

    // 1: damage items, recorded individually (audit trail, dispute
    // eligibility, Damages page) but WITHOUT their usual per-item invoice —
    // the settlement bills one combined amount instead.
    for (const item of input.damageItems) {
        await recordDamage(
            rentalId,
            { amount: item.amount, description: item.description },
            item.photoPaths,
            actor,
            { skipInvoice: true },
        );
    }

    const otherChargesAmount = round2(input.otherCharges.reduce((sum, c) => sum + c.amount, 0));

    // 2: close the rental. This approves the return, releases the vehicle,
    // ends the subscription, starts the deposit clock AND writes the
    // settlement row — including the damage just recorded above.
    await completeRide(
        rentalId,
        {
            inspected: true,
            late_fee_override: input.lateFeeOverride,
            end_battery_pct: input.endBatteryPct,
            other_charges_amount: otherChargesAmount,
        },
        actor,
    );

    const settlement = await getSettlementByRentalId(rentalId);
    if (!settlement) throw notFound("Settlement not found after creation.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.user_id,
        action: "settlement.created",
        entityType: "rental_settlement",
        entityId: rentalId,
        after: {
            deposit_amount: settlement.deposit_amount,
            late_fee_amount: settlement.late_fee_amount,
            damage_fee_amount: settlement.damage_fee_amount,
            // The itemised list has no column, so the audit entry is where the
            // breakdown of a staff-entered charge is preserved.
            other_charges: input.otherCharges,
            total_charges: settlement.total_charges,
            net_settlement: settlement.net_settlement,
        },
    });

    // 3: refund, fired immediately — no waiting period, the admin just
    // inspected the vehicle and finalised every charge in this same review.
    if (settlement.refund_amount > 0) {
        const deposit = await getDepositForSubscriptionOrNull(before.subscription_id);

        // A refund needs the payment it reverses: `refunds.payment_transaction_id`
        // is NOT NULL, which is a real improvement — a refund with no
        // originating payment could never be reconciled with the gateway.
        const { data: payment, error: paymentError } = await supabaseAdmin
            .from("payment_transactions")
            .select("id, payment_orders!inner(subscription_id)")
            .eq("payment_orders.subscription_id", before.subscription_id)
            .eq("status", "succeeded")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (paymentError) throw paymentError;

        if (!payment) {
            console.error("[returns] settlement owes a refund but no captured payment exists", {
                rentalId, amount: settlement.refund_amount,
            });
        } else {
            const { data: refund, error: refundError } = await supabaseAdmin
                .from("refunds")
                .insert({
                    user_id: before.user_id,
                    payment_transaction_id: payment.id,
                    amount: settlement.refund_amount,
                    reason: "settlement",
                    status: "pending",
                })
                .select("id")
                .single();
            if (refundError) throw refundError;

            await supabaseAdmin
                .from("rental_settlements")
                .update({ refund_id: refund.id })
                .eq("rental_id", rentalId);

            await writeAudit({
                actorId: actor.id,
                targetUserId: before.user_id,
                action: "settlement.refund_issued",
                entityType: "rental_settlement",
                entityId: rentalId,
                after: { refund_id: refund.id, amount: settlement.refund_amount, deposit_id: deposit?.id ?? null },
            });

            try {
                await processRefund(refund.id, actor);
                await writeAudit({
                    actorId: actor.id,
                    targetUserId: before.user_id,
                    action: "settlement.completed",
                    entityType: "rental_settlement",
                    entityId: rentalId,
                    after: { refund_id: refund.id },
                });
            } catch (err) {
                // Gateway call failed — the settlement and the rental closure
                // must still stand. The refund stays pending and is retryable
                // through POST /refunds/:id/retry, same as any other.
                console.error("[returns] refund processing failed", {
                    rentalId, refundId: refund.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    // 4: one combined invoice when the charges exceeded the deposit.
    if (settlement.due_amount > 0) {
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from("invoices")
            .insert({
                user_id: before.user_id,
                subscription_id: before.subscription_id,
                rental_id: rentalId,
                purpose: "settlement",
                status: "issued",
                subtotal_amount: settlement.due_amount,
                total_amount: settlement.due_amount,
                issued_on: businessToday(),
                due_on: businessToday(),
                invoice_series_code: "SNG",
                // NOT NULL with no default, but trg_allocate_invoice_number
                // overwrites it BEFORE INSERT — that trigger is what keeps the
                // series gap-free, so the number must not be chosen here.
                invoice_number: "",
            })
            .select("id")
            .single();
        if (invoiceError) throw invoiceError;

        const { error: itemError } = await supabaseAdmin.from("invoice_items").insert({
            invoice_id: invoice.id,
            item_type: "adjustment",
            description: "Return settlement — charges exceeding deposit",
            line_number: 1,
            quantity: 1,
            unit_amount: settlement.due_amount,
            amount: settlement.due_amount,
        });
        if (itemError) throw itemError;

        await supabaseAdmin
            .from("rental_settlements")
            .update({ invoice_id: invoice.id })
            .eq("rental_id", rentalId);

        await writeAudit({
            actorId: actor.id,
            targetUserId: before.user_id,
            action: "settlement.due_created",
            entityType: "rental_settlement",
            entityId: rentalId,
            after: { due_invoice_id: invoice.id, amount: settlement.due_amount },
        });
    }

    if (settlement.net_settlement === 0) {
        await writeAudit({
            actorId: actor.id,
            targetUserId: before.user_id,
            action: "settlement.completed",
            entityType: "rental_settlement",
            entityId: rentalId,
            after: { outcome: "balanced" },
        });
    }

    const final = await getSettlementByRentalId(rentalId);
    if (!final) throw notFound("Settlement not found after creation.");
    return final;
}

/**
 * Settlements for the admin list.
 *
 * The `status` filter is applied in memory rather than in SQL: it is derived
 * from the outcome AND the refund's own status, so there is no single column
 * to filter on. At this console's scale that is the honest trade — the
 * alternative is reintroducing the mirrored status column the schema removed.
 */
export async function listSettlements(
    filters: ListSettlementsFilters,
): Promise<Paginated<ReturnSettlementRow>> {
    const [from, to] = toRange(filters);

    let query = supabaseAdmin
        .from("rental_settlements")
        .select(SETTLEMENT_COLUMNS, { count: "exact" })
        .order(filters.sortBy, { ascending: filters.sortDir === "asc" });

    if (!filters.status) query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as unknown as RawSettlementRow[]).map(toSettlementRow);

    if (!filters.status) return paginate(rows, count ?? 0, filters);

    const matching = rows.filter((r) => r.status === filters.status);
    return paginate(matching.slice(from, to + 1), matching.length, filters);
}

/** The rider's own most recent settlement, or null — GET /rentals/me/settlement. */
export async function getMySettlement(userId: string): Promise<ReturnSettlementRow | null> {
    const { data, error } = await supabaseAdmin
        .from("rental_settlements")
        .select(SETTLEMENT_COLUMNS)
        .eq("rentals.user_id", userId)
        .order("settled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data ? toSettlementRow(data as unknown as RawSettlementRow) : null;
}
