import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import {
    completeRide, computeLateReturnPenalty, effectiveDueAt, getRentalById,
} from "../rentals/rentals.service";
import { recordDamage } from "../damages/damages.service";
import { getDepositForBookingOrNull } from "../deposits/deposits.service";
import { processRefund } from "../refunds/refunds.service";
import {
    ApproveReturnSettlementInput, ListSettlementsFilters, OtherCharge, ReturnDetailView,
    ReturnSettlementRow, ReturnSettlementStatus,
} from "./returns.types";

const SETTLEMENT_COLUMNS = `
    id, rental_id, booking_id, user_id, vehicle_id, deposit_amount, late_fee_amount, damage_fee_amount,
    other_charges, other_charges_amount, total_charges, net_settlement, refund_amount, due_amount,
    status, refund_id, due_invoice_id, created_at, processed_at,
    processed_by:users!return_settlements_processed_by_fkey(id, full_name)
`;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawSettlementRow {
    id: string; rental_id: string; booking_id: string; user_id: string; vehicle_id: string;
    deposit_amount: number | string; late_fee_amount: number | string; damage_fee_amount: number | string;
    other_charges: OtherCharge[]; other_charges_amount: number | string; total_charges: number | string;
    net_settlement: number | string; refund_amount: number | string; due_amount: number | string;
    status: ReturnSettlementStatus; refund_id: string | null; due_invoice_id: string | null;
    created_at: string; processed_at: string | null; processed_by: unknown;
}

function toSettlementRow(row: RawSettlementRow): ReturnSettlementRow {
    return {
        id: row.id, rental_id: row.rental_id, booking_id: row.booking_id, user_id: row.user_id,
        vehicle_id: row.vehicle_id,
        deposit_amount: Number(row.deposit_amount), late_fee_amount: Number(row.late_fee_amount),
        damage_fee_amount: Number(row.damage_fee_amount), other_charges: row.other_charges ?? [],
        other_charges_amount: Number(row.other_charges_amount), total_charges: Number(row.total_charges),
        net_settlement: Number(row.net_settlement), refund_amount: Number(row.refund_amount),
        due_amount: Number(row.due_amount), status: row.status, refund_id: row.refund_id,
        due_invoice_id: row.due_invoice_id, created_at: row.created_at, processed_at: row.processed_at,
        processed_by: unwrap<{ id: string; full_name: string }>(row.processed_by),
    };
}

async function getSettlementByRentalId(rentalId: string): Promise<ReturnSettlementRow | null> {
    const { data, error } = await supabaseAdmin
        .from("return_settlements").select(SETTLEMENT_COLUMNS).eq("rental_id", rentalId).maybeSingle();
    if (error) throw error;
    return data ? toSettlementRow(data as unknown as RawSettlementRow) : null;
}

/** Everything the admin Return Detail page needs in one call. */
export async function getReturnDetail(rentalId: string): Promise<ReturnDetailView> {
    const rental = await getRentalById(rentalId);

    const { data: raw, error } = await supabaseAdmin
        .from("rentals").select("booking_id, return_due_at, expires_at").eq("id", rentalId).maybeSingle();
    if (error) throw error;
    if (!raw) throw notFound("Rental not found.");

    const deposit = raw.booking_id ? await getDepositForBookingOrNull(raw.booking_id) : null;

    const { data: damageRows, error: damageError } = await supabaseAdmin
        .from("damages")
        .select(`
            id, booking_id, rental_id, amount, description, photo_urls, deposit_deduction, outstanding_amount,
            status, created_at, disputed_at, dispute_reason, dispute_resolved_at, dispute_resolution_notes,
            disputed_amount_held, reported_by:users!reported_by(id, full_name), disputed_by:users!disputed_by(id, full_name)
        `)
        .eq("rental_id", rentalId)
        .order("created_at", { ascending: true });
    if (damageError) throw damageError;

    const latePreview = computeLateReturnPenalty({ returnDueAt: effectiveDueAt(raw) });
    const settlement = await getSettlementByRentalId(rentalId);

    return {
        rental,
        deposit,
        // The signed photo_urls minting damages.service.ts does for its own
        // list endpoint isn't needed here — the amounts/descriptions are what
        // the settlement math and review UI actually use.
        damages: (damageRows ?? []) as unknown as ReturnDetailView["damages"],
        latePreview: { daysLate: latePreview.daysLate, penaltyAmount: latePreview.penaltyAmount, feePerDay: latePreview.feePerDay },
        settlement,
    };
}

/**
 * The full return-approval + settlement orchestrator (requirement #10).
 * Reuses completeRide (rental/booking closure, vehicle -> available) and
 * processRefund (the actual gateway call) verbatim — this function's own
 * job is only the settlement math, the record, and linking the two.
 */
export async function approveReturnSettlement(
    rentalId: string, input: ApproveReturnSettlementInput, actor: AuthContext,
): Promise<ReturnSettlementRow> {
    const { data: before, error: beforeError } = await supabaseAdmin
        .from("rentals")
        .select("id, user_id, vehicle_id, booking_id, status, return_requested_at")
        .eq("id", rentalId)
        .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw notFound("Rental not found.");
    if (before.status !== "active") throw businessRule("This ride is not active.");
    if (!before.return_requested_at) throw businessRule("No return has been requested for this rental.");
    if (!before.booking_id) throw businessRule("This rental has no booking on file — nothing to settle.");

    // 1-2: damage items, recorded individually (audit trail, dispute
    // eligibility, Damages page) but WITHOUT their usual per-item invoice —
    // the settlement below bills one combined amount instead.
    for (const item of input.damageItems) {
        await recordDamage(
            rentalId,
            { amount: item.amount, description: item.description },
            item.photoPaths,
            actor,
            { skipInvoice: true },
        );
    }

    // 3: close the rental/booking, flip the vehicle to 'available' — the
    // exact same function the old popup called, unchanged.
    const rental = await completeRide(
        rentalId,
        { inspected: true, late_fee_override: input.lateFeeOverride, end_battery_pct: input.endBatteryPct },
        actor,
    );

    // 4: late fee straight off completeRide's own return value — no re-fetch, no drift.
    const lateFeeAmount = rental.late_penalty_amount ?? 0;

    // 5: raw damage amounts (not deposit_deduction) — the settlement formula
    // is deposit MINUS full charge amounts, per the confirmed worked examples.
    const { data: damageRows, error: damageError } = await supabaseAdmin
        .from("damages").select("amount").eq("booking_id", before.booking_id).neq("status", "disputed");
    if (damageError) throw damageError;
    const damageFeeAmount = round2((damageRows ?? []).reduce((sum, r) => sum + Number(r.amount), 0));

    // 6-9: totals.
    const otherChargesAmount = round2(input.otherCharges.reduce((sum, c) => sum + c.amount, 0));
    const deposit = await getDepositForBookingOrNull(before.booking_id);
    const depositAmount = deposit ? deposit.amount : 0;
    const totalCharges = round2(lateFeeAmount + damageFeeAmount + otherChargesAmount);
    const netSettlement = round2(depositAmount - totalCharges);
    const refundAmount = Math.max(0, netSettlement);
    const dueAmount = Math.max(0, -netSettlement);

    const initialStatus: ReturnSettlementStatus =
        netSettlement === 0 ? "settlement_completed"
            : refundAmount > 0 ? "pending_refund"
                : "amount_due";

    // 10: the settlement record.
    const { data: inserted, error: insertError } = await supabaseAdmin
        .from("return_settlements")
        .insert({
            rental_id: rentalId, booking_id: before.booking_id, user_id: before.user_id, vehicle_id: before.vehicle_id,
            deposit_amount: depositAmount, late_fee_amount: lateFeeAmount, damage_fee_amount: damageFeeAmount,
            other_charges: input.otherCharges, other_charges_amount: otherChargesAmount,
            total_charges: totalCharges, net_settlement: netSettlement,
            refund_amount: refundAmount, due_amount: dueAmount,
            status: initialStatus, processed_by: actor.id,
            processed_at: initialStatus === "settlement_completed" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
    if (insertError) throw insertError;
    const settlementId = inserted.id as string;

    await writeAudit({
        actorId: actor.id, targetUserId: before.user_id, action: "settlement.created",
        entityType: "settlement", entityId: settlementId,
        after: { deposit_amount: depositAmount, total_charges: totalCharges, net_settlement: netSettlement },
    });

    // 11: refund, fired immediately — no 15-day wait, the admin just
    // inspected the vehicle and finalized every charge in this same review.
    if (refundAmount > 0 && deposit) {
        const { data: refund, error: refundError } = await supabaseAdmin
            .from("refunds")
            .insert({
                deposit_id: deposit.id, booking_id: before.booking_id, amount: refundAmount,
                status: "pending", refund_type: "return_settlement",
            })
            .select("id")
            .single();
        if (refundError) throw refundError;
        const refundId = refund.id as string;

        await supabaseAdmin.from("return_settlements").update({ refund_id: refundId }).eq("id", settlementId);
        await writeAudit({
            actorId: actor.id, targetUserId: before.user_id, action: "settlement.refund_issued",
            entityType: "settlement", entityId: settlementId, after: { refund_id: refundId, amount: refundAmount },
        });

        try {
            await processRefund(refundId, actor);
            await supabaseAdmin
                .from("return_settlements")
                .update({ status: "refund_completed", processed_at: new Date().toISOString() })
                .eq("id", settlementId);
            await writeAudit({
                actorId: actor.id, targetUserId: before.user_id, action: "settlement.completed",
                entityType: "settlement", entityId: settlementId, after: { status: "refund_completed" },
            });
        } catch (err) {
            // Gateway call failed — the settlement record and rental closure
            // must still persist. Stays 'pending_refund', retryable via the
            // existing POST /refunds/:id/retry and failed-refund-retry cron,
            // same as any other refund.
            console.error("[returns] refund processing failed", { settlementId, refundId, error: err instanceof Error ? err.message : err });
        }
    }

    // 12: one combined due invoice — reuses the existing 'damage' payment
    // path unchanged (createOrderForInvoice/applyPaymentSuccess already
    // handle it; see payments.service.ts for the settlement-completion hook).
    if (dueAmount > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: invoice, error: invoiceError } = await supabaseAdmin
            .from("invoices")
            .insert({
                user_id: before.user_id, booking_id: before.booking_id, payment_type: "damage",
                status: "issued", amount_due: dueAmount, due_date: today, payment_status: "pending",
            })
            .select("id")
            .single();
        if (invoiceError) throw invoiceError;

        await supabaseAdmin.from("return_settlements").update({ due_invoice_id: invoice.id }).eq("id", settlementId);
        await writeAudit({
            actorId: actor.id, targetUserId: before.user_id, action: "settlement.due_created",
            entityType: "settlement", entityId: settlementId, after: { due_invoice_id: invoice.id, amount: dueAmount },
        });
    }

    if (initialStatus === "settlement_completed") {
        await writeAudit({
            actorId: actor.id, targetUserId: before.user_id, action: "settlement.completed",
            entityType: "settlement", entityId: settlementId, after: { status: "settlement_completed" },
        });
    }

    const final = await getSettlementByRentalId(rentalId);
    if (!final) throw notFound("Settlement not found after creation.");
    return final;
}

export async function listSettlements(filters: ListSettlementsFilters): Promise<Paginated<ReturnSettlementRow>> {
    let query = supabaseAdmin.from("return_settlements").select(SETTLEMENT_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawSettlementRow[]).map(toSettlementRow), count ?? 0, filters);
}

/** The rider's own most recent settlement, or null — GET /rentals/me/settlement. */
export async function getMySettlement(userId: string): Promise<ReturnSettlementRow | null> {
    const { data, error } = await supabaseAdmin
        .from("return_settlements")
        .select(SETTLEMENT_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data ? toSettlementRow(data as unknown as RawSettlementRow) : null;
}
