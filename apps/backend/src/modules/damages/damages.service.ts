import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { env } from "../../config/env";
import { notifyUser } from "../notifications/notifications.service";
import { recomputeDepositStatusForBooking } from "../deposits/deposits.service";
import { AuthContext, Paginated } from "../../types";
import { createSignedDamagePhotoUrl } from "./damages.photo.storage";
import { DamageRow, DisputeDamageInput, ListDamagesFilters, RecordDamageInput, ResolveDisputeInput } from "./damages.types";

const DAMAGE_COLUMNS = `
    id, booking_id, rental_id, amount, description, photo_urls, deposit_deduction, outstanding_amount,
    status, created_at, disputed_at, dispute_reason, dispute_resolved_at, dispute_resolution_notes,
    disputed_amount_held,
    reported_by:users!reported_by(id, full_name),
    disputed_by:users!disputed_by(id, full_name)
`;

interface RawDamageRow {
    id: string;
    booking_id: string;
    rental_id: string;
    amount: number | string;
    description: string;
    photo_urls: string[];
    deposit_deduction: number | string;
    outstanding_amount: number | string;
    status: DamageRow["status"];
    created_at: string;
    disputed_at: string | null;
    dispute_reason: string | null;
    dispute_resolved_at: string | null;
    dispute_resolution_notes: string | null;
    disputed_amount_held: number | string | null;
    reported_by: unknown;
    disputed_by: unknown;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

async function toDamageRow(row: RawDamageRow): Promise<DamageRow> {
    return {
        id: row.id,
        booking_id: row.booking_id,
        rental_id: row.rental_id,
        reported_by: unwrap(row.reported_by),
        amount: Number(row.amount),
        description: row.description,
        photo_urls: await Promise.all((row.photo_urls ?? []).map((p) => createSignedDamagePhotoUrl(p))),
        deposit_deduction: Number(row.deposit_deduction),
        outstanding_amount: Number(row.outstanding_amount),
        status: row.status,
        created_at: row.created_at,
        disputed_at: row.disputed_at,
        disputed_by: unwrap(row.disputed_by),
        dispute_reason: row.dispute_reason,
        dispute_resolved_at: row.dispute_resolved_at,
        dispute_resolution_notes: row.dispute_resolution_notes,
        disputed_amount_held: row.disputed_amount_held == null ? null : Number(row.disputed_amount_held),
    };
}

export interface DamageDeduction {
    depositDeduction: number;
    outstandingAmount: number;
}

/**
 * Pure deduction math, exported for the same reason
 * computeCancellationCharge/computeLateReturnPenalty are: tests exercise
 * this exact rule. deposit_deduction never exceeds what's actually left in
 * the deposit; a negative refund is never produced.
 */
export function computeDamageDeduction(damageAmount: number, depositAmount: number): DamageDeduction {
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const depositDeduction = round2(Math.min(Math.max(0, depositAmount), Math.max(0, damageAmount)));
    const outstandingAmount = round2(Math.max(0, damageAmount - depositDeduction));
    return { depositDeduction, outstandingAmount };
}

async function requireBookingAndDeposit(bookingId: string): Promise<{ userId: string; depositAmount: number }> {
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id")
        .eq("id", bookingId)
        .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) throw notFound("Booking not found.");

    const { data: deposit, error: depositError } = await supabaseAdmin
        .from("deposits")
        .select("amount")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (depositError) throw depositError;

    return { userId: booking.user_id as string, depositAmount: deposit ? Number(deposit.amount) : 0 };
}

/**
 * Staff return-inspection damage entry. A separate, explicit action from
 * completeRide/moveRideToMaintenance (see rentals.service.ts) so a no-damage
 * return never has to touch this at all.
 */
export async function recordDamage(
    rentalId: string,
    input: RecordDamageInput,
    photoPaths: string[],
    actor: AuthContext,
): Promise<DamageRow> {
    const { data: rental, error: rentalError } = await supabaseAdmin
        .from("rentals")
        .select("id, booking_id")
        .eq("id", rentalId)
        .maybeSingle();
    if (rentalError) throw rentalError;
    if (!rental) throw notFound("Rental not found.");
    if (!rental.booking_id) {
        throw businessRule("This rental has no booking/deposit on file — damage can't be settled against a deposit here.");
    }

    const { userId, depositAmount } = await requireBookingAndDeposit(rental.booking_id);
    const { depositDeduction, outstandingAmount } = computeDamageDeduction(input.amount, depositAmount);

    const { data, error } = await supabaseAdmin
        .from("damages")
        .insert({
            booking_id: rental.booking_id,
            rental_id: rentalId,
            reported_by: actor.id,
            amount: input.amount,
            description: input.description,
            photo_urls: photoPaths,
            deposit_deduction: depositDeduction,
            outstanding_amount: outstandingAmount,
            status: "recorded",
        })
        .select(DAMAGE_COLUMNS)
        .single();
    if (error) throw error;
    const damage = await toDamageRow(data as unknown as RawDamageRow);

    if (outstandingAmount > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const { error: invoiceError } = await supabaseAdmin.from("invoices").insert({
            user_id: userId,
            booking_id: rental.booking_id,
            damage_id: damage.id,
            payment_type: "damage",
            status: "issued",
            amount_due: outstandingAmount,
            due_date: today,
            payment_status: "pending",
        });
        if (invoiceError) throw invoiceError;
    }

    await recomputeDepositStatusForBooking(rental.booking_id);

    await writeAudit({
        actorId: actor.id, targetUserId: userId, action: "damage.created",
        entityType: "damage", entityId: damage.id,
        after: { amount: input.amount, deposit_deduction: depositDeduction, outstanding_amount: outstandingAmount },
    });

    await notifyUser(userId, {
        template: "damage_added",
        title: "Damage Charge Added",
        body: outstandingAmount > 0
            ? `A damage charge of ₹${input.amount} has been recorded. ₹${outstandingAmount} is due after your deposit deduction.`
            : `A damage charge of ₹${input.amount} has been added to your account.`,
        screen: "my-plan",
    });

    return damage;
}

async function requireDamage(id: string): Promise<RawDamageRow> {
    const { data, error } = await supabaseAdmin.from("damages").select(DAMAGE_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Damage record not found.");
    return data as unknown as RawDamageRow;
}

/** Rider dispute — must be the booking's own rider, within the configurable dispute window. */
export async function disputeDamage(id: string, input: DisputeDamageInput, actor: AuthContext): Promise<DamageRow> {
    const damage = await requireDamage(id);

    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id")
        .eq("id", damage.booking_id)
        .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking || booking.user_id !== actor.id) throw notFound("Damage record not found.");

    if (damage.status !== "recorded") throw conflict("This damage record can no longer be disputed.");

    const windowMs = env.damageDisputeWindowHours * 60 * 60 * 1000;
    if (Date.now() - new Date(damage.created_at).getTime() > windowMs) {
        throw businessRule(`Disputes must be raised within ${env.damageDisputeWindowHours} hours of the damage being recorded.`);
    }

    const { data, error } = await supabaseAdmin
        .from("damages")
        .update({
            status: "disputed",
            disputed_at: new Date().toISOString(),
            disputed_by: actor.id,
            dispute_reason: input.reason,
            disputed_amount_held: damage.deposit_deduction,
        })
        .eq("id", id)
        .eq("status", "recorded")
        .select(DAMAGE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw conflict("This damage record can no longer be disputed.");

    // Excluding a disputed damage's deduction from the refundable-amount sum
    // may free up more of the deposit — recompute in case this un-forfeits it.
    await recomputeDepositStatusForBooking(damage.booking_id);

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "damage.disputed",
        entityType: "damage", entityId: id, after: { reason: input.reason },
    });

    return toDamageRow(data as unknown as RawDamageRow);
}

/**
 * Staff resolves a dispute — may uphold or adjust the amount. Re-runs the
 * deduction math against the (possibly new) amount and pushes the deposit's
 * refund-eligibility clock to dispute_resolved_at + N days, since the
 * dispute held up whatever the original return-based eligibility date was.
 */
export async function resolveDispute(id: string, input: ResolveDisputeInput, actor: AuthContext): Promise<DamageRow> {
    const damage = await requireDamage(id);
    if (damage.status !== "disputed") throw conflict("This damage record has no open dispute.");

    const { userId, depositAmount } = await requireBookingAndDeposit(damage.booking_id);
    const finalAmount = input.resolved_amount ?? Number(damage.amount);
    const { depositDeduction, outstandingAmount } = computeDamageDeduction(finalAmount, depositAmount);

    const resolvedAt = new Date();
    const { data, error } = await supabaseAdmin
        .from("damages")
        .update({
            amount: finalAmount,
            deposit_deduction: depositDeduction,
            outstanding_amount: outstandingAmount,
            status: "resolved",
            dispute_resolved_at: resolvedAt.toISOString(),
            dispute_resolved_by: actor.id,
            dispute_resolution_notes: input.notes,
            disputed_amount_held: null,
        })
        .eq("id", id)
        .eq("status", "disputed")
        .select(DAMAGE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw conflict("This damage record has no open dispute.");

    // Keep the outstanding-amount invoice (if any) in sync with the resolved amount.
    if (outstandingAmount > 0) {
        const { data: existingInvoice } = await supabaseAdmin
            .from("invoices")
            .select("id")
            .eq("damage_id", id)
            .maybeSingle();
        if (existingInvoice) {
            await supabaseAdmin
                .from("invoices")
                .update({ amount_due: outstandingAmount })
                .eq("id", existingInvoice.id)
                .eq("payment_status", "pending");
        } else {
            const today = resolvedAt.toISOString().slice(0, 10);
            await supabaseAdmin.from("invoices").insert({
                user_id: userId, booking_id: damage.booking_id, damage_id: id,
                payment_type: "damage", status: "issued", amount_due: outstandingAmount,
                due_date: today, payment_status: "pending",
            });
        }
    }

    await recomputeDepositStatusForBooking(damage.booking_id);

    // The dispute held up the refund clock — restart it from resolution, not
    // the original return date.
    const eligible = new Date(resolvedAt);
    eligible.setDate(eligible.getDate() + env.depositRefundEligibilityDays);
    await supabaseAdmin
        .from("deposits")
        .update({ refund_eligible_at: eligible.toISOString() })
        .eq("booking_id", damage.booking_id)
        .eq("status", "held");

    await writeAudit({
        actorId: actor.id, targetUserId: userId, action: "damage.resolved",
        entityType: "damage", entityId: id,
        after: { amount: finalAmount, deposit_deduction: depositDeduction, outstanding_amount: outstandingAmount },
    });

    await notifyUser(userId, {
        template: "damage_dispute_resolved",
        title: "Damage Dispute Resolved",
        body: "Your damage dispute has been reviewed and resolved. Check your plan for the updated charge.",
        screen: "my-plan",
    });

    return toDamageRow(data as unknown as RawDamageRow);
}

export async function listDamages(filters: ListDamagesFilters): Promise<Paginated<DamageRow>> {
    let query = supabaseAdmin.from("damages").select(DAMAGE_COLUMNS, { count: "exact" });
    if (filters.bookingId) query = query.eq("booking_id", filters.bookingId);
    if (filters.status) query = query.eq("status", filters.status);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = await Promise.all(((data ?? []) as unknown as RawDamageRow[]).map(toDamageRow));
    return paginate(rows, count ?? 0, filters);
}

export async function getDamageById(id: string): Promise<DamageRow> {
    const row = await requireDamage(id);
    return toDamageRow(row);
}

/**
 * Same lookup, but ownership-checked — 404 (not 403, same reasoning as
 * disputeDamage) if the caller isn't staff and doesn't own the booking this
 * damage belongs to. Use this for any route reachable by a rider.
 */
export async function getDamageForActor(id: string, actor: AuthContext, callerIsStaff: boolean): Promise<DamageRow> {
    const row = await requireDamage(id);
    if (!callerIsStaff) {
        const { data: booking, error } = await supabaseAdmin
            .from("bookings")
            .select("user_id")
            .eq("id", row.booking_id)
            .maybeSingle();
        if (error) throw error;
        if (!booking || booking.user_id !== actor.id) throw notFound("Damage record not found.");
    }
    return toDamageRow(row);
}

/** Rider's own damage records for one of their own bookings — ownership-checked. */
export async function listMyDamages(bookingId: string, actor: AuthContext): Promise<DamageRow[]> {
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id")
        .eq("id", bookingId)
        .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking || booking.user_id !== actor.id) throw notFound("Booking not found.");

    const { data, error } = await supabaseAdmin
        .from("damages")
        .select(DAMAGE_COLUMNS)
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return Promise.all(((data ?? []) as unknown as RawDamageRow[]).map(toDamageRow));
}
