import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import { completeRide, damageAmountFor, getRentalById } from "../rentals/rentals.service";
import { listDamagesForRental } from "../damages/damages.service";
import { getDepositForSubscriptionOrNull } from "../deposits/deposits.service";
import { processRefund } from "../refunds/refunds.service";
import { notifyUser } from "../notifications/notifications.service";
import { businessToday } from "../../common/dates";
import {
    ApproveReturnSettlementInput, ListSettlementsFilters, PaymentReviewView, ReturnDetailView,
    ReturnSettlementRow, ReturnSettlementStatus, ReturnStage, ReturnStageStatus, SaveInspectionInput,
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

/**
 * `rentals!inner`, and the `!inner` is load-bearing.
 *
 * PostgREST applies a filter on an embedded column to the EMBED, not to the
 * parent — unless the embed is inner. Without it, getMySettlement's
 * `.eq("rentals.user_id", userId)` did not restrict `rental_settlements` at
 * all: it nulled the `rentals` object out on non-matching rows and returned
 * every settlement in the table, so `.order(settled_at desc).limit(1)`
 * handed back THE NEWEST SETTLEMENT IN THE SYSTEM to whoever asked. A rider
 * 25 days into an active rental, who had never requested a return, was shown
 * "Scooter Returned Successfully" carrying another rider's deposit and
 * damage figures.
 *
 * Nothing is lost by making it inner: `rental_settlements.rental_id` is the
 * primary key and a NOT NULL foreign key, so every settlement has exactly
 * one rental. The admin list and the by-rental read below return the same
 * rows either way — and any ownership filter added later now actually
 * filters.
 */
const SETTLEMENT_COLUMNS = `
    rental_id, settled_at, deposit_amount_snapshot, late_fee_amount, damage_amount,
    other_charges_amount, total_charges_amount, net_amount, outcome,
    refund_id, invoice_id, created_at,
    settled_by:users!settled_by_user_id(id, full_name),
    rentals!inner(
        user_id, subscriptions(booking_id),
        rider:users(id, full_name),
        rental_vehicle_assignments(vehicle_id, vehicles(id, display_name, registration_number))
    ),
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
    const rental = unwrap<{
        user_id: string; subscriptions: unknown; rider: unknown; rental_vehicle_assignments: unknown;
    }>(row.rentals);
    const subscription = rental ? unwrap<{ booking_id: string }>(rental.subscriptions) : null;
    const rider = rental ? unwrap<{ id: string; full_name: string }>(rental.rider) : null;
    const assignment = rental
        ? unwrap<{ vehicle_id: string; vehicles: unknown }>(rental.rental_vehicle_assignments)
        : null;
    const vehicle = assignment
        ? unwrap<{ id: string; display_name: string | null; registration_number: string }>(assignment.vehicles)
        : null;
    const refund = unwrap<{ status: string }>(row.refunds);
    const net = Number(row.net_amount);
    const dueAmount = Math.max(0, -net);

    return {
        // The table is keyed by rental_id — there is no separate settlement id.
        id: row.rental_id,
        rental_id: row.rental_id,
        booking_id: subscription?.booking_id ?? null,
        user_id: rental?.user_id ?? "",
        rider_name: rider?.full_name ?? null,
        vehicle_id: assignment?.vehicle_id ?? null,
        vehicle: vehicle
            ? { id: vehicle.id, name: vehicle.display_name ?? "", registration_number: vehicle.registration_number }
            : null,
        deposit_amount: Number(row.deposit_amount_snapshot),
        late_fee_amount: Number(row.late_fee_amount),
        damage_fee_amount: Number(row.damage_amount),
        other_charges: [],
        other_charges_amount: Number(row.other_charges_amount),
        total_charges: Number(row.total_charges_amount),
        net_settlement: net,
        refund_amount: Math.max(0, net),
        due_amount: dueAmount,
        // What the rider paid directly (beyond the deposit) toward
        // total_charges. Kept separate from due_amount because due_amount
        // gets zeroed out by the self-heal below/in listSettlements once the
        // invoice is confirmed paid — this is what lets the settlement panel
        // still show that money, instead of the charges just silently
        // "disappearing" once the due amount reads as settled.
        paid_by_rider_amount: row.outcome === "amount_due" ? dueAmount : 0,
        status: toStatus(row.outcome, refund?.status ?? null),
        refund_id: row.refund_id,
        due_invoice_id: row.invoice_id,
        processed_by: unwrap<{ id: string; full_name: string }>(row.settled_by),
        created_at: row.created_at,
        processed_at: row.settled_at,
    };
}

/**
 * `rental_settlements` itself cannot represent "the amount due was already
 * paid before completion" — `chk_rental_settlements_net` pins `net_amount`
 * to `deposit_amount_snapshot - total_charges_amount` exactly, and
 * `chk_rental_settlements_invoice_link` requires `outcome = 'amount_due'`
 * whenever `invoice_id` is set. Both are correct as a historical record of
 * what the deposit-vs-charges arithmetic actually was; neither has anywhere
 * to record that the shortfall was collected UPFRONT via the Overdue Rider
 * → Payment Gate flow (settleReturn reuses that pre-paid invoice as
 * `invoice_id` rather than minting a new one — see rentals.service.ts).
 *
 * So the correction happens here, at read time, the same way this codebase
 * always treats "is it actually paid" as something v_invoice_balances
 * answers fresh rather than a status column: if the linked invoice is
 * already settled, the row the rider/admin actually SEE reports it as
 * balanced/nothing due, even though the raw row underneath still (correctly,
 * per its own constraints) says amount_due.
 */
async function getSettlementByRentalId(rentalId: string): Promise<ReturnSettlementRow | null> {
    const { data, error } = await supabaseAdmin
        .from("rental_settlements")
        .select(SETTLEMENT_COLUMNS)
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = toSettlementRow(data as unknown as RawSettlementRow);
    if (row.status === "amount_due" && row.due_invoice_id && await isInvoicePaid(row.due_invoice_id)) {
        return { ...row, status: "settlement_completed", due_amount: 0 };
    }
    return row;
}

/**
 * `trg_allocate_invoice_number()` matches `invoice_series.code` EXACTLY —
 * the live series is fiscal-year-suffixed ("SNG-FY2627"), not the plain
 * "SNG" a hardcoded literal would guess. See the same fix and fuller
 * comment in overdueLateFee.ts's activeInvoiceSeriesCode, which this reuses.
 */
async function activeInvoiceSeriesCode(): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("invoice_series")
        .select("code")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("No active invoice series is configured.");
    return data.code;
}

async function isInvoicePaid(invoiceId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("is_paid")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    return data?.is_paid === true;
}

/**
 * The additional-amount-due invoice, created once at inspection time and
 * reused on any re-read — mirrors overdueLateFee.ts's ensureOverdueLateFeeInvoice.
 * purpose='settlement' + rental_id set is what lets it flow through the
 * EXISTING payment pipeline (createOrderForInvoice / checkout / verify)
 * exactly like the old post-completion due-invoice did, just raised earlier.
 */
async function ensureReturnSettlementInvoice(
    rentalId: string,
    userId: string,
    subscriptionId: string,
    amount: number,
): Promise<string> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("rental_returns")
        .select("additional_due_invoice_id")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.additional_due_invoice_id) return existing.additional_due_invoice_id;

    const today = businessToday();
    const seriesCode = await activeInvoiceSeriesCode();
    const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .insert({
            user_id: userId,
            subscription_id: subscriptionId,
            rental_id: rentalId,
            purpose: "settlement",
            status: "issued",
            subtotal_amount: amount,
            total_amount: amount,
            issued_on: today,
            due_on: today,
            invoice_series_code: seriesCode,
            invoice_number: "",
        })
        .select("id")
        .single();
    if (invoiceError) throw invoiceError;

    const { error: itemError } = await supabaseAdmin.from("invoice_items").insert({
        invoice_id: invoice.id,
        item_type: "adjustment",
        description: "Return settlement — additional amount due",
        line_number: 1,
        quantity: 1,
        unit_amount: amount,
        amount,
    });
    if (itemError) throw itemError;

    return invoice.id;
}

interface RawReturnRow {
    status: string;
    inspected_at: string | null;
    other_charges_amount: number | string | null;
    additional_due_invoice_id: string | null;
    payment_verified_at: string | null;
}

/**
 * Vehicle Return → Inspection → Payment Gate → Approve Return — see
 * returns.types.ts's ReturnStage.
 *
 * No late fee component here on purpose: the renewal late fee is collected
 * upfront in the rider app, before a return can even be requested (Overdue
 * Rider → Late Fee Payment → Return gate, overdueLateFee.ts) — a SEPARATE
 * late fee charged again here, for the physical handover, would double up
 * on the same word for two different things. Additional amount due is
 * damage + other staff-entered charges only.
 */
export async function computeReturnStage(rentalId: string, subscriptionId: string): Promise<ReturnStage | null> {
    const { data: ret, error } = await supabaseAdmin
        .from("rental_returns")
        .select("status, inspected_at, other_charges_amount, additional_due_invoice_id, payment_verified_at")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!ret) return null;
    const row = ret as RawReturnRow;

    const deposit = await getDepositForSubscriptionOrNull(subscriptionId);
    const depositAmount = deposit?.amount ?? 0;

    if (row.status === "rejected") {
        return {
            status: "rejected", depositAmount, damageAmount: 0, otherChargesAmount: 0,
            totalCharges: 0, additionalDue: 0, refundDue: 0, additionalDueInvoiceId: null, paymentVerifiedAt: null,
        };
    }
    if (row.status === "approved") {
        return {
            status: "return_completed", depositAmount, damageAmount: 0, otherChargesAmount: 0,
            totalCharges: 0, additionalDue: 0, refundDue: 0, additionalDueInvoiceId: null, paymentVerifiedAt: null,
        };
    }
    // Damage can now be recorded incrementally, ahead of the final "Save
    // Inspection" submit — recordDamage stamps `inspected_at` the moment the
    // FIRST one is added, well before the admin is done. So `inspected_at`
    // is no longer the right signal for "has this return moved past the
    // inspection step" — `status` is: it only leaves "requested" when
    // saveInspection explicitly finalizes it. Charges already staged are
    // still surfaced live (damageAmount/otherChargesAmount/totalCharges), so
    // the settlement panel can show a running total as items are added —
    // additionalDue/refundDue stay at their pre-finalization defaults so
    // nothing downstream (the rider's own view, an invoice) reacts before
    // the admin actually finishes.
    const damageAmount = await damageAmountFor(rentalId);
    const otherChargesAmount = Number(row.other_charges_amount ?? 0);
    const totalCharges = round2(damageAmount + otherChargesAmount);

    if (row.status === "requested") {
        return {
            status: "return_requested", depositAmount, damageAmount, otherChargesAmount, totalCharges,
            additionalDue: 0, refundDue: depositAmount,
            additionalDueInvoiceId: null, paymentVerifiedAt: null,
        };
    }

    const additionalDue = round2(Math.max(0, totalCharges - depositAmount));
    const refundDue = round2(Math.max(0, depositAmount - totalCharges));

    let status: ReturnStageStatus;
    let paymentVerifiedAt = row.payment_verified_at;
    if (additionalDue <= 0 || paymentVerifiedAt) {
        status = "ready_for_approval";
    } else if (row.additional_due_invoice_id && await isInvoicePaid(row.additional_due_invoice_id)) {
        // Auto-verify: once the gateway has actually captured the payment
        // (isInvoicePaid, not just an order placed), there's nothing left for
        // a human to confirm — waiting on an explicit admin click here just
        // stalls a return that's already fully paid. Written here, not just
        // reflected in the returned status, because settleReturn's own gate
        // checks the STORED payment_verified_at column directly — Approve
        // Return would otherwise reject a return this page just told the
        // admin was "Ready to Complete."
        paymentVerifiedAt = new Date().toISOString();
        const { error: verifyError } = await supabaseAdmin
            .from("rental_returns")
            .update({ payment_verified_at: paymentVerifiedAt })
            .eq("rental_id", rentalId)
            .is("payment_verified_at", null);
        if (verifyError) throw verifyError;
        await writeAudit({
            actorId: null,
            targetUserId: null,
            action: "return.payment_verified",
            entityType: "rental_return",
            entityId: rentalId,
            after: { invoice_id: row.additional_due_invoice_id },
        });
        status = "ready_for_approval";
    } else {
        status = "payment_required";
    }

    return {
        status, depositAmount, damageAmount, otherChargesAmount, totalCharges,
        additionalDue, refundDue,
        additionalDueInvoiceId: row.additional_due_invoice_id, paymentVerifiedAt,
    };
}

/** Everything the admin Return Detail page needs in one call. */
export async function getReturnDetail(rentalId: string): Promise<ReturnDetailView> {
    const rental = await getRentalById(rentalId);

    const { data: raw, error } = await supabaseAdmin
        .from("rentals")
        .select("subscription_id")
        .eq("id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!raw) throw notFound("Rental not found.");

    const deposit = await getDepositForSubscriptionOrNull(raw.subscription_id);

    return {
        rental,
        deposit,
        damages: await listDamagesForRental(rentalId),
        settlement: await getSettlementByRentalId(rentalId),
        stage: await computeReturnStage(rentalId, raw.subscription_id),
    };
}

/**
 * Admin Inspection — "Save Inspection" / "Request Payment from Rider" are one
 * action: stage other charges and — only if they leave an additional amount
 * due — raise the payable invoice and tell the rider. No late fee here: the
 * renewal late fee is already collected upfront in the rider app (Overdue
 * Rider → Late Fee Payment → Return gate), so charging one again at
 * inspection would double it up under the same name. Nothing here touches
 * the rental's own status, releases the vehicle, or ends the subscription;
 * that is Approve Return's job, and it stays blocked until this return
 * reaches ready_for_approval.
 *
 * Damage itself is no longer submitted here — each damage charge is recorded
 * immediately as it's added (see addReturnDamage), complete with its photos,
 * so it shows up as its own card right away instead of waiting on this final
 * submit. `inspected_at` is stamped the moment the first one is recorded; if
 * none ever was, the admin must explicitly confirm a clean inspection via
 * `confirmNoDamage`.
 */
export async function saveInspection(
    rentalId: string,
    input: SaveInspectionInput,
    actor: AuthContext,
): Promise<ReturnDetailView> {
    const { data: before, error: beforeError } = await supabaseAdmin
        .from("rentals")
        .select("id, user_id, status, subscription_id, rental_returns(status, inspected_at)")
        .eq("id", rentalId)
        .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) throw notFound("Rental not found.");
    if (before.status !== "active") throw businessRule("This ride is not active.");

    const ret = unwrap<{ status: string; inspected_at: string | null }>(before.rental_returns);
    if (!ret || ret.status === "rejected" || ret.status === "approved") {
        throw businessRule("No return has been requested for this rental.");
    }
    if (ret.status === "inspected") throw conflict("This return has already been inspected.");
    if (!ret.inspected_at && !input.confirmNoDamage) {
        throw businessRule(
            "Record the vehicle inspection — add a damage charge, or confirm none — before saving.",
        );
    }

    const otherChargesAmount = round2(input.otherCharges.reduce((sum, c) => sum + c.amount, 0));

    const { error: updateError } = await supabaseAdmin
        .from("rental_returns")
        .update({
            status: "inspected",
            other_charges_amount: otherChargesAmount,
            // recordDamage above already stamps inspected_at the moment actual
            // damage is found; a damage-free inspection needs it stamped here.
            inspected_at: new Date().toISOString(),
            inspected_by_user_id: actor.id,
        })
        .eq("rental_id", rentalId)
        .eq("status", "requested")
        .is("inspected_at", null);
    if (updateError) throw updateError;
    // If the row above didn't match (recordDamage already stamped
    // inspected_at), the status/amounts still need writing — a second,
    // narrower update covers that without clobbering the earlier timestamp.
    await supabaseAdmin
        .from("rental_returns")
        .update({ status: "inspected", other_charges_amount: otherChargesAmount })
        .eq("rental_id", rentalId)
        .eq("status", "requested");

    const damageAmount = await damageAmountFor(rentalId);
    const deposit = await getDepositForSubscriptionOrNull(before.subscription_id);
    const depositAmount = deposit?.amount ?? 0;
    const totalCharges = round2(damageAmount + otherChargesAmount);
    const additionalDue = round2(Math.max(0, totalCharges - depositAmount));

    if (additionalDue > 0) {
        const invoiceId = await ensureReturnSettlementInvoice(
            rentalId, before.user_id, before.subscription_id, additionalDue,
        );
        await supabaseAdmin
            .from("rental_returns")
            .update({ additional_due_invoice_id: invoiceId })
            .eq("rental_id", rentalId);

        await notifyUser(before.user_id, {
            template: "return_payment_required",
            title: "Payment Required",
            body: `An additional ₹${additionalDue} is due to complete your scooter return. Please pay to continue.`,
            screen: "billing",
        });
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.user_id,
        action: "return.inspected",
        entityType: "rental_return",
        entityId: rentalId,
        after: {
            damage_amount: damageAmount, other_charges_amount: otherChargesAmount,
            total_charges: totalCharges, additional_due: additionalDue,
        },
    });

    return getReturnDetail(rentalId);
}

/** Admin "Review Payment" — the amount, reference, date, and status the spec asks to display. */
export async function getPaymentReview(rentalId: string): Promise<PaymentReviewView> {
    const { data: ret, error } = await supabaseAdmin
        .from("rental_returns")
        .select("additional_due_invoice_id, payment_verified_at")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!ret?.additional_due_invoice_id) throw notFound("No payment is due for this return.");

    const { data: txn, error: txnError } = await supabaseAdmin
        .from("payment_transactions")
        .select("amount, gateway_payment_id, captured_at, status, payment_orders!inner(invoice_id)")
        .eq("payment_orders.invoice_id", ret.additional_due_invoice_id)
        .eq("status", "succeeded")
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (txnError) throw txnError;

    return {
        invoiceId: ret.additional_due_invoice_id,
        amount: txn ? Number(txn.amount) : 0,
        reference: txn?.gateway_payment_id ?? null,
        paidAt: txn?.captured_at ?? null,
        status: ret.payment_verified_at ? "verified" : txn ? "paid" : "unpaid",
    };
}

/**
 * Admin confirms a captured payment — the explicit human step the spec
 * requires beyond the gateway simply reporting success. Rejects if the
 * invoice genuinely isn't paid yet, so this can never be used to wave
 * through an unpaid return.
 */
export async function verifyReturnPayment(rentalId: string, actor: AuthContext): Promise<ReturnDetailView> {
    const { data: ret, error } = await supabaseAdmin
        .from("rental_returns")
        .select("additional_due_invoice_id, payment_verified_at")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!ret?.additional_due_invoice_id) throw notFound("No payment is due for this return.");
    if (ret.payment_verified_at) return getReturnDetail(rentalId);

    if (!await isInvoicePaid(ret.additional_due_invoice_id)) {
        throw businessRule("This payment has not been captured yet — it can't be verified.");
    }

    const { error: updateError } = await supabaseAdmin
        .from("rental_returns")
        .update({ payment_verified_at: new Date().toISOString(), payment_verified_by_user_id: actor.id })
        .eq("rental_id", rentalId);
    if (updateError) throw updateError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "return.payment_verified",
        entityType: "rental_return",
        entityId: rentalId,
        after: { invoice_id: ret.additional_due_invoice_id },
    });

    return getReturnDetail(rentalId);
}

/**
 * Approve Return. Only reachable once the return has staged its inspection
 * and — if anything was owed — that amount is paid AND admin-verified;
 * settleReturn (rentals.service.ts) enforces the same gate independently,
 * so this is not the only thing standing between an unpaid return and completion.
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

    const ret = unwrap<{ status: string }>(before.rental_returns);

    if (before.status !== "active") {
        // A duplicate submission (double-click/double-tap firing this mutation
        // twice) landing after the first request already approved the same
        // return should hand back what was just created, not error — the
        // admin's screen shows the return as complete either way, so a second
        // request finding it already approved is not a real conflict.
        if (ret?.status === "approved") {
            const existing = await getSettlementByRentalId(rentalId);
            if (existing) return existing;
        }
        throw businessRule("This ride is not active.");
    }

    if (!ret || (ret.status !== "requested" && ret.status !== "inspected")) {
        throw businessRule("No return has been requested for this rental.");
    }

    const stage = await computeReturnStage(rentalId, before.subscription_id);
    if (stage && stage.status !== "ready_for_approval") {
        throw businessRule(
            stage.additionalDue > 0
                ? "The rider's outstanding additional amount must be paid and verified before this return can be approved."
                : "This return must be inspected before it can be approved.",
        );
    }

    // Close the rental. This approves the return, releases the vehicle, ends
    // the subscription, starts the deposit clock AND writes the settlement
    // row — using the charges already staged at inspection (settleReturn
    // reads them off the return row itself; nothing fresh is passed in here).
    await completeRide(rentalId, { inspected: true, end_battery_pct: input.endBatteryPct }, actor);

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
            other_charges_amount: settlement.other_charges_amount,
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
            .select("id, payment_orders!inner(invoices!inner(subscription_id))")
            .eq("payment_orders.invoices.subscription_id", before.subscription_id)
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

    // 4: a combined invoice for charges exceeding the deposit — but only as a
    // fallback. The normal path already has one: settleReturn attaches
    // whatever additional_due_invoice_id inspection raised (paid and
    // verified, per the gate above) directly onto the settlement row, so
    // settlement.due_invoice_id is already set by the time we get here.
    if (settlement.due_amount > 0 && !settlement.due_invoice_id) {
        const seriesCode = await activeInvoiceSeriesCode();
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
                invoice_series_code: seriesCode,
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
/**
 * Batch version of getSettlementByRentalId's self-heal: an "amount_due" row
 * whose invoice was actually paid afterward (checked live against
 * v_invoice_balances, same as everywhere else in this file) reports as
 * settled here too. Without this, a settlement the rider already paid off
 * through the app — like the Kavi/TN22AB0004 return, paid via the return
 * payment gate — stayed stuck showing "Amount Due" forever on the Settled
 * list, even though getSettlementByRentalId already corrected it on the
 * Return Detail page for that exact same rental.
 */
async function healAmountDueRows(rows: ReturnSettlementRow[]): Promise<ReturnSettlementRow[]> {
    const dueInvoiceIds = rows
        .filter((r): r is ReturnSettlementRow & { due_invoice_id: string } => r.status === "amount_due" && !!r.due_invoice_id)
        .map((r) => r.due_invoice_id);
    if (dueInvoiceIds.length === 0) return rows;

    const { data, error } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("invoice_id, is_paid")
        .in("invoice_id", dueInvoiceIds);
    if (error) throw error;

    const paidIds = new Set((data ?? []).filter((r) => r.is_paid).map((r) => r.invoice_id));
    return rows.map((r) =>
        r.status === "amount_due" && r.due_invoice_id && paidIds.has(r.due_invoice_id)
            ? { ...r, status: "settlement_completed" as const, due_amount: 0 }
            : r,
    );
}

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

    const rows = await healAmountDueRows(((data ?? []) as unknown as RawSettlementRow[]).map(toSettlementRow));

    if (!filters.status) return paginate(rows, count ?? 0, filters);

    const matching = rows.filter((r) => r.status === filters.status);
    return paginate(matching.slice(from, to + 1), matching.length, filters);
}

/**
 * Every past settlement for this rider, newest first — GET
 * /rentals/me/settlements. Plural and distinct from getMySettlement
 * (singular — "what's due right now, if anything"): this is the rider's own
 * billing HISTORY. Before this existed, Billing showed only the rider's
 * single most recent settlement, gated behind "no active booking/rental" —
 * so the moment a rider picked up a NEW vehicle, their previous rental's
 * whole payment record disappeared from the app instead of just moving into
 * a history list.
 */
export async function getMySettlementHistory(
    userId: string,
    filters: { page: number; pageSize: number },
): Promise<Paginated<ReturnSettlementRow>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("rental_settlements")
        .select(SETTLEMENT_COLUMNS, { count: "exact" })
        .eq("rentals.user_id", userId)
        .order("settled_at", { ascending: false })
        .range(from, to);
    if (error) throw error;

    // Belt and braces over the `!inner` embed, same reasoning as
    // getMySettlement: an ownership filter that rests entirely on an
    // embedded join is one keyword away from silently matching everyone.
    const rows = (await healAmountDueRows(((data ?? []) as unknown as RawSettlementRow[]).map(toSettlementRow)))
        .filter((r) => r.user_id === userId);
    return paginate(rows, count ?? 0, filters);
}

/**
 * The rider's own most recent settlement, or null — GET /rentals/me/settlement.
 *
 * A completed settlement (`rental_settlements`) wins when one exists. With
 * none, this also surfaces a return still IN PROGRESS with an unpaid
 * additional-amount-due invoice (Payment Required) — synthesized into the
 * exact same shape so the existing rider-app SettlementCard's "Pay ₹X" flow
 * renders it with no changes on that side at all. It intentionally stops
 * once the invoice is actually paid (Payment Submitted, awaiting admin
 * verification) rather than keep offering to pay again.
 */
export async function getMySettlement(userId: string): Promise<ReturnSettlementRow | null> {
    // An unresolved payment gate on the rider's CURRENT return — checked
    // first, and ahead of any historical completed settlement below. A rider
    // on their second (or later) rental already has an old, genuinely
    // completed settlement from a PRIOR one; without this ordering, that old
    // row would always win (being the only `rental_settlements` row that
    // exists) and shadow the new return's actual outstanding amount — Home
    // would show nothing due, and My Scooter would say "Returned
    // Successfully" for a return that hasn't even been paid for yet.
    const pendingSettlement = await getMyPendingSettlement(userId);
    if (pendingSettlement) return pendingSettlement;

    const { data, error } = await supabaseAdmin
        .from("rental_settlements")
        .select(SETTLEMENT_COLUMNS)
        .eq("rentals.user_id", userId)
        .order("settled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (data) {
        const row = toSettlementRow(data as unknown as RawSettlementRow);
        // Belt and braces over the `!inner` embed above. Ownership on this
        // endpoint rests on an embedded filter, which is one keyword away
        // from silently matching everyone — and the failure is invisible in
        // the response, because toSettlementRow reads a nulled embed as
        // `user_id: ""`. Whoever the row belongs to, it goes only to them.
        if (row.user_id !== userId) return null;
        // Same self-heal as getSettlementByRentalId (admin view): the STORED
        // row can never say "the amount due was pre-paid via the payment
        // gate before completion" — chk_rental_settlements_net still shows
        // the raw deposit-vs-charges shortfall even though that shortfall
        // was already collected and verified beforehand. Without this, the
        // rider keeps seeing a due amount on an already-closed return.
        if (row.status === "amount_due" && row.due_invoice_id && await isInvoicePaid(row.due_invoice_id)) {
            return { ...row, status: "settlement_completed", due_amount: 0 };
        }
        return row;
    }
    return null;
}

/**
 * The rider's own in-progress return with an outstanding (unpaid, or paid
 * but not yet admin-verified) additional-amount-due invoice — synthesized
 * into the same ReturnSettlementRow shape as a real `rental_settlements` row
 * so the existing rider-app SettlementCard renders it unchanged. Null once
 * there is no such return, or its invoice is actually paid (Payment
 * Submitted, awaiting verification, is deliberately not "due" any more).
 */
async function getMyPendingSettlement(userId: string): Promise<ReturnSettlementRow | null> {
    const { data: pending, error: pendingError } = await supabaseAdmin
        .from("rental_returns")
        .select(`
            rental_id, other_charges_amount, additional_due_invoice_id, payment_verified_at,
            rentals!inner(user_id, subscription_id)
        `)
        .eq("rentals.user_id", userId)
        .not("additional_due_invoice_id", "is", null)
        .is("payment_verified_at", null)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending?.additional_due_invoice_id) return null;
    if (await isInvoicePaid(pending.additional_due_invoice_id)) return null;

    const rental = unwrap<{ user_id: string; subscription_id: string }>(pending.rentals);
    if (!rental) return null;

    const damageAmount = await damageAmountFor(pending.rental_id);
    const otherChargesAmount = Number(pending.other_charges_amount ?? 0);
    const totalCharges = round2(damageAmount + otherChargesAmount);
    const deposit = await getDepositForSubscriptionOrNull(rental.subscription_id);
    const depositAmount = deposit?.amount ?? 0;
    const dueAmount = round2(Math.max(0, totalCharges - depositAmount));
    if (dueAmount <= 0) return null;

    return {
        id: pending.rental_id,
        rental_id: pending.rental_id,
        booking_id: null,
        user_id: rental.user_id,
        // Rider-facing synthesized row — the rider already knows who they
        // are and which scooter they have; this shape exists to feed the
        // SettlementCard's due-amount display, not an admin list.
        rider_name: null,
        vehicle_id: null,
        vehicle: null,
        deposit_amount: depositAmount,
        late_fee_amount: 0,
        damage_fee_amount: damageAmount,
        other_charges: [],
        other_charges_amount: otherChargesAmount,
        total_charges: totalCharges,
        net_settlement: -dueAmount,
        refund_amount: 0,
        due_amount: dueAmount,
        paid_by_rider_amount: 0,
        status: "amount_due",
        refund_id: null,
        due_invoice_id: pending.additional_due_invoice_id,
        processed_by: null,
        created_at: new Date().toISOString(),
        processed_at: null,
    };
}

/**
 * The rider's own view of Vehicle Return → Inspection → Payment Gate →
 * Approve Return — GET /rentals/me/return-stage. Reuses computeReturnStage
 * (the admin Return Detail page's exact same derivation) so the rider and
 * admin can never see two different answers to "what's the state of this
 * return." Null once there's no return to report on at all (never
 * requested, or the most recent one was rejected and nothing followed it).
 *
 * Scoped to the rider's most recent rental_returns row regardless of
 * whether that rental is still active — a return in Payment Required/
 * Submitted keeps the rental active, but Return Completed doesn't, and the
 * rider still needs to see that terminal state too.
 */
export async function getMyReturnStage(userId: string): Promise<ReturnStage | null> {
    const { data: ret, error } = await supabaseAdmin
        .from("rental_returns")
        .select("rental_id, status, rentals!inner(user_id, subscription_id)")
        .eq("rentals.user_id", userId)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!ret) return null;

    const rental = unwrap<{ user_id: string; subscription_id: string }>(ret.rentals);
    if (!rental) return null;

    return computeReturnStage(ret.rental_id, rental.subscription_id);
}

export interface ReturnStageSummary {
    charges: number;
    amountDue: number;
    paymentStatus: "not_required" | "pending" | "paid";
}

/**
 * Batch version of computeReturnStage for the Returns list's Pending tab —
 * same "compute one summary per admin row" shape as overdueLateFeeStatusFor
 * in overdueLateFee.ts, just for the inspection/payment stage instead of the
 * renewal late fee. Rentals with no return request at all (or none matching)
 * are simply absent from the returned map.
 */
export async function returnStageSummaryFor(rentalIds: string[]): Promise<Map<string, ReturnStageSummary>> {
    const result = new Map<string, ReturnStageSummary>();
    if (rentalIds.length === 0) return result;

    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("id, subscription_id")
        .in("id", rentalIds);
    if (error) throw error;

    for (const row of data ?? []) {
        const stage = await computeReturnStage(row.id, row.subscription_id);
        if (!stage) continue;
        const paymentStatus: ReturnStageSummary["paymentStatus"] =
            stage.status === "payment_required" ? "pending"
                : stage.status === "payment_submitted" || stage.status === "ready_for_approval"
                    || stage.status === "return_completed" ? "paid"
                    : "not_required";
        result.set(row.id, { charges: stage.totalCharges, amountDue: stage.additionalDue, paymentStatus });
    }

    return result;
}
