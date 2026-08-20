import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { env } from "../../config/env";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import {
    getDepositForSubscriptionOrNull, recomputeDepositStatusForSubscription,
} from "../deposits/deposits.service";
import { AuthContext, Paginated } from "../../types";
import { createSignedDamagePhotoUrl } from "./damages.photo.storage";
import { DamageRow, DisputeDamageInput, ListDamagesFilters, RecordDamageInput, ResolveDisputeInput } from "./damages.types";
import { businessToday } from "../../common/dates";

/**
 * Damage.
 *
 * One table became three — `incidents`, `damages`, `damage_disputes` — so
 * every write here is now two or three rows, and every read is a join. The
 * API shape is unchanged; the flattening happens in {@link toDamageRow}.
 *
 * The other change is that `deposit_deduction` and `outstanding_amount` are
 * no longer stored. They were a per-damage answer to a question only the
 * whole settlement can answer: with two damages and one deposit, each row's
 * deduction depends on the other, and nothing kept them consistent.
 * {@link computeDamageDeduction} still exists and is still the rule — it is
 * just applied in order across the rider's damages at read time.
 */

const DAMAGE_COLUMNS = `
    id, assessed_amount, notes, status, created_at,
    incidents!inner(
        id, rental_id, description, photo_paths, reported_at,
        reported_by:users!reported_by_user_id(id, full_name),
        rentals(subscription_id, subscriptions(booking_id))
    ),
    damage_disputes(
        raised_at, reason, amount_held, resolved_at, resolution_notes, outcome,
        raised_by:users!raised_by_user_id(id, full_name)
    )
`;

interface RawDamageRow {
    id: string;
    assessed_amount: number | string;
    notes: string | null;
    status: DamageRow["status"];
    created_at: string;
    incidents: unknown;
    damage_disputes: unknown;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function toDamageRow(row: RawDamageRow, deduction?: DamageDeduction): Promise<DamageRow> {
    const incident = unwrap<{
        id: string; rental_id: string | null; description: string; photo_paths: string[];
        reported_by: unknown; rentals: unknown;
    }>(row.incidents);
    const rental = unwrap<{ subscription_id: string; subscriptions: unknown }>(incident?.rentals);
    const subscription = unwrap<{ booking_id: string }>(rental?.subscriptions);
    const dispute = unwrap<{
        raised_at: string; reason: string; amount_held: number | string;
        resolved_at: string | null; resolution_notes: string | null; raised_by: unknown;
    }>(row.damage_disputes);

    const amount = Number(row.assessed_amount);

    return {
        id: row.id,
        booking_id: subscription?.booking_id ?? null,
        rental_id: incident?.rental_id ?? null,
        reported_by: unwrap(incident?.reported_by),
        amount,
        // The assessor's note when there is one, otherwise what was reported.
        description: row.notes ?? incident?.description ?? "",
        photo_urls: await Promise.all(
            (incident?.photo_paths ?? []).map((p) => createSignedDamagePhotoUrl(p)),
        ),
        // Falls back to "the deposit covers none of it" when the caller has
        // not resolved the whole set — never to a stale stored figure.
        deposit_deduction: deduction?.depositDeduction ?? 0,
        outstanding_amount: deduction?.outstandingAmount ?? amount,
        status: row.status,
        created_at: row.created_at,
        disputed_at: dispute?.raised_at ?? null,
        disputed_by: unwrap(dispute?.raised_by),
        dispute_reason: dispute?.reason ?? null,
        dispute_resolved_at: dispute?.resolved_at ?? null,
        dispute_resolution_notes: dispute?.resolution_notes ?? null,
        disputed_amount_held: dispute ? Number(dispute.amount_held) : null,
    };
}

export interface DamageDeduction {
    depositDeduction: number;
    outstandingAmount: number;
}

/**
 * Pure deduction math, exported for the same reason
 * computeCancellationCharge/computeLateReturnPenalty are: tests exercise this
 * exact rule. The deduction never exceeds what is left in the deposit, and a
 * negative refund is never produced.
 */
export function computeDamageDeduction(damageAmount: number, depositAmount: number): DamageDeduction {
    const depositDeduction = round2(Math.min(Math.max(0, depositAmount), Math.max(0, damageAmount)));
    const outstandingAmount = round2(Math.max(0, damageAmount - depositDeduction));
    return { depositDeduction, outstandingAmount };
}

/**
 * Applies {@link computeDamageDeduction} across a set of damages in order,
 * draining one deposit — which is the arithmetic the per-row columns could
 * never express.
 */
async function deductionsFor(
    rows: RawDamageRow[],
): Promise<Map<string, DamageDeduction>> {
    const result = new Map<string, DamageDeduction>();
    if (rows.length === 0) return result;

    // Group by subscription: each deposit is drained independently.
    const bySubscription = new Map<string, RawDamageRow[]>();
    for (const row of rows) {
        const incident = unwrap<{ rentals: unknown }>(row.incidents);
        const rental = unwrap<{ subscription_id: string }>(incident?.rentals);
        if (!rental) {
            result.set(row.id, { depositDeduction: 0, outstandingAmount: Number(row.assessed_amount) });
            continue;
        }
        const group = bySubscription.get(rental.subscription_id) ?? [];
        group.push(row);
        bySubscription.set(rental.subscription_id, group);
    }

    for (const [subscriptionId, group] of bySubscription) {
        const deposit = await getDepositForSubscriptionOrNull(subscriptionId);
        let remaining = deposit?.amount ?? 0;

        // Oldest first, so the order is stable and matches how the charges
        // were incurred.
        for (const row of [...group].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
            // A disputed damage holds its share but is not yet deducted.
            if (row.status === "disputed" || row.status === "waived") {
                result.set(row.id, { depositDeduction: 0, outstandingAmount: 0 });
                continue;
            }
            const split = computeDamageDeduction(Number(row.assessed_amount), remaining);
            remaining = round2(remaining - split.depositDeduction);
            result.set(row.id, split);
        }
    }

    return result;
}

async function toDamageRows(rows: RawDamageRow[]): Promise<DamageRow[]> {
    const deductions = await deductionsFor(rows);
    return Promise.all(rows.map((r) => toDamageRow(r, deductions.get(r.id))));
}

/** The rider and subscription behind a rental. */
async function rentalContext(rentalId: string) {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("id, user_id, subscription_id, subscriptions(booking_id)")
        .eq("id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Rental not found.");
    const subscription = unwrap<{ booking_id: string }>(data.subscriptions);
    return {
        userId: data.user_id,
        subscriptionId: data.subscription_id,
        bookingId: subscription?.booking_id ?? null,
    };
}

/**
 * Staff return-inspection damage entry.
 *
 * Writes an incident and then the damage assessed against it. The photos and
 * the narrative belong to the incident; only the money belongs to the damage.
 */
export async function recordDamage(
    rentalId: string,
    input: RecordDamageInput,
    photoPaths: string[],
    actor: AuthContext,
    opts?: { skipInvoice?: boolean },
): Promise<DamageRow> {
    const { userId, subscriptionId, bookingId } = await rentalContext(rentalId);

    const { data: currentVehicle } = await supabaseAdmin
        .from("v_rental_current_vehicle")
        .select("vehicle_id")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (!currentVehicle?.vehicle_id) {
        throw businessRule("This rental has no vehicle attached to record damage against.");
    }

    // A damage-bearing inspection stamps the return automatically — the
    // return-review flow only asks staff to explicitly confirm a CLEAN
    // inspection; recording actual damage already proves one happened.
    await supabaseAdmin
        .from("rental_returns")
        .update({ inspected_at: new Date().toISOString(), inspected_by_user_id: actor.id })
        .eq("rental_id", rentalId)
        .is("inspected_at", null);

    const { data: incident, error: incidentError } = await supabaseAdmin
        .from("incidents")
        .insert({
            vehicle_id: currentVehicle.vehicle_id,
            rental_id: rentalId,
            incident_type: "damage",
            description: input.description,
            photo_paths: photoPaths,
            reported_by_user_id: actor.id,
            status: "closed",
        })
        .select("id")
        .single();
    if (incidentError) throw incidentError;

    const { data, error } = await supabaseAdmin
        .from("damages")
        .insert({
            incident_id: incident.id,
            assessed_amount: input.amount,
            assessed_by_user_id: actor.id,
            notes: input.description,
            status: "assessed",
        })
        .select(DAMAGE_COLUMNS)
        .single();
    if (error) throw error;

    const [damage] = await toDamageRows([data as unknown as RawDamageRow]);

    // The return-settlement flow records damage without a per-item invoice —
    // it bills ONE combined amount for the whole return instead.
    if (damage.outstanding_amount > 0 && !opts?.skipInvoice) {
        await raiseDamageInvoice(subscriptionId, userId, damage.outstanding_amount, damage.id);
    }

    await recomputeDepositStatusForSubscription(subscriptionId);

    await writeAudit({
        actorId: actor.id, targetUserId: userId, action: "damage.created",
        entityType: "damage", entityId: damage.id,
        after: {
            amount: input.amount,
            incident_id: incident.id,
            deposit_deduction: damage.deposit_deduction,
            outstanding_amount: damage.outstanding_amount,
        },
    });

    await notifyUser(userId, {
        template: "damage_added",
        title: "Damage Charge Added",
        body: damage.outstanding_amount > 0
            ? `A damage charge of ₹${input.amount} has been recorded. ₹${damage.outstanding_amount} is due after your deposit deduction.`
            : `A damage charge of ₹${input.amount} has been added to your account.`,
        screen: "my-plan",
    });

    await notify({
        notificationType: "damage_added",
        referenceType: "damage",
        referenceId: damage.id,
        title: "Damage Reported",
        bodyFallback: `A ₹${input.amount} damage charge was recorded for {rider} on {vehicle}.`,
        screen: "/damages",
        riderId: userId,
        vehicleId: currentVehicle.vehicle_id,
        bookingId: bookingId ?? undefined,
        excludeUserId: actor.id,
    });

    return damage;
}

/** The separate bill for damage the deposit does not cover. */
async function raiseDamageInvoice(
    subscriptionId: string,
    userId: string,
    amount: number,
    damageId: string,
): Promise<void> {
    const today = businessToday();

    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .insert({
            user_id: userId,
            subscription_id: subscriptionId,
            purpose: "adhoc",
            status: "issued",
            subtotal_amount: amount,
            total_amount: amount,
            issued_on: today,
            due_on: today,
            invoice_series_code: "SNG",
            // Allocated by trg_allocate_invoice_number BEFORE INSERT.
            invoice_number: "",
        })
        .select("id")
        .single();
    if (error) throw error;

    const { error: itemError } = await supabaseAdmin.from("invoice_items").insert({
        invoice_id: invoice.id,
        item_type: "adjustment",
        description: "Vehicle damage",
        line_number: 1,
        quantity: 1,
        unit_amount: amount,
        amount,
    });
    if (itemError) throw itemError;

    // `invoices.damage_id` is gone — the link is the adjustment, which is
    // also what makes the charge visible alongside every other one.
    const { error: adjustmentError } = await supabaseAdmin.from("subscription_adjustments").insert({
        subscription_id: subscriptionId,
        kind: "charge",
        code_snapshot: "damage",
        name_snapshot: "Vehicle damage",
        amount,
        damage_id: damageId,
        status: "invoiced",
    });
    if (adjustmentError) throw adjustmentError;
}

async function requireDamage(id: string): Promise<RawDamageRow> {
    const { data, error } = await supabaseAdmin
        .from("damages")
        .select(DAMAGE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Damage record not found.");
    return data as unknown as RawDamageRow;
}

/** The subscription and rider a damage belongs to. */
async function damageContext(row: RawDamageRow) {
    const incident = unwrap<{ rental_id: string | null; rentals: unknown }>(row.incidents);
    const rental = unwrap<{ subscription_id: string; subscriptions: unknown }>(incident?.rentals);
    if (!rental) throw businessRule("This damage is not linked to a rental.");

    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, user_id, booking_id")
        .eq("id", rental.subscription_id)
        .single();
    if (error) throw error;
    return { subscriptionId: data.id, userId: data.user_id, bookingId: data.booking_id };
}

/** Rider dispute — must be the rider, within the configurable dispute window. */
export async function disputeDamage(
    id: string,
    input: DisputeDamageInput,
    actor: AuthContext,
): Promise<DamageRow> {
    const row = await requireDamage(id);
    const { subscriptionId, userId } = await damageContext(row);
    if (userId !== actor.id) throw notFound("Damage record not found.");
    if (row.status !== "assessed") throw conflict("This damage record can no longer be disputed.");

    const windowMs = env.damageDisputeWindowHours * 60 * 60 * 1000;
    if (Date.now() - new Date(row.created_at).getTime() > windowMs) {
        throw businessRule(
            `Disputes must be raised within ${env.damageDisputeWindowHours} hours of the damage being recorded.`,
        );
    }

    const [current] = await toDamageRows([row]);

    const { error: disputeError } = await supabaseAdmin.from("damage_disputes").insert({
        damage_id: id,
        raised_at: new Date().toISOString(),
        raised_by_user_id: actor.id,
        reason: input.reason,
        // What the deposit was covering at the moment of the dispute — held
        // rather than deducted until it is resolved.
        amount_held: current.deposit_deduction,
    });
    if (disputeError) {
        if ((disputeError as { code?: string }).code === "23505") {
            throw conflict("This damage record has already been disputed.");
        }
        throw disputeError;
    }

    const { data: updated, error } = await supabaseAdmin
        .from("damages")
        .update({ status: "disputed" })
        .eq("id", id)
        .eq("status", "assessed")
        .select(DAMAGE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!updated) throw conflict("This damage record can no longer be disputed.");

    // A disputed damage leaves the refundable sum, which may un-forfeit the
    // deposit — recompute.
    await recomputeDepositStatusForSubscription(subscriptionId);

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "damage.disputed",
        entityType: "damage_dispute", entityId: id, after: { reason: input.reason },
    });

    const [result] = await toDamageRows([updated as unknown as RawDamageRow]);
    return result;
}

/**
 * Staff resolves a dispute — may uphold or adjust the amount, and pushes the
 * deposit's refund-eligibility clock out from the resolution date, since the
 * dispute held up whatever the return-based date was.
 */
export async function resolveDispute(
    id: string,
    input: ResolveDisputeInput,
    actor: AuthContext,
): Promise<DamageRow> {
    const row = await requireDamage(id);
    if (row.status !== "disputed") throw conflict("This damage record has no open dispute.");

    const { subscriptionId, userId } = await damageContext(row);

    // Never modify a settlement already paid out — record a fresh damage as
    // an adjustment instead.
    const deposit = await getDepositForSubscriptionOrNull(subscriptionId);
    if (deposit?.status === "released") {
        throw businessRule(
            "This deposit has already been released — record a new damage as an adjustment instead of editing this dispute.",
        );
    }

    const finalAmount = input.resolved_amount ?? Number(row.assessed_amount);
    const upheld = input.resolved_amount === undefined
        || round2(input.resolved_amount) === round2(Number(row.assessed_amount));
    const resolvedAt = new Date();

    const { error: disputeError } = await supabaseAdmin
        .from("damage_disputes")
        .update({
            resolved_at: resolvedAt.toISOString(),
            resolved_by_user_id: actor.id,
            resolution_notes: input.notes,
            // `dispute_outcome` records what the review DECIDED, which the old
            // schema threw away — it only kept the resulting amount.
            outcome: finalAmount === 0 ? "rejected" : upheld ? "upheld" : "partially_upheld",
        })
        .eq("damage_id", id)
        .is("resolved_at", null);
    if (disputeError) throw disputeError;

    const { data: updated, error } = await supabaseAdmin
        .from("damages")
        .update({
            assessed_amount: finalAmount,
            notes: input.notes,
            status: finalAmount === 0 ? "waived" : "assessed",
        })
        .eq("id", id)
        .eq("status", "disputed")
        .select(DAMAGE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!updated) throw conflict("This damage record has no open dispute.");

    const [damage] = await toDamageRows([updated as unknown as RawDamageRow]);

    // Keep the separate bill in step with the resolved amount.
    const { data: adjustment } = await supabaseAdmin
        .from("subscription_adjustments")
        .select("id, status")
        .eq("damage_id", id)
        .maybeSingle();

    if (damage.outstanding_amount > 0 && !adjustment) {
        await raiseDamageInvoice(subscriptionId, userId, damage.outstanding_amount, id);
    } else if (adjustment && adjustment.status === "pending") {
        await supabaseAdmin
            .from("subscription_adjustments")
            .update({ amount: damage.outstanding_amount })
            .eq("id", adjustment.id);
    }

    await recomputeDepositStatusForSubscription(subscriptionId);

    // The dispute held up the refund clock — restart it from resolution.
    const eligible = new Date(resolvedAt);
    eligible.setDate(eligible.getDate() + env.depositRefundEligibilityDays);
    await supabaseAdmin
        .from("deposits")
        .update({ refund_eligible_on: businessToday(eligible) })
        .eq("subscription_id", subscriptionId)
        .eq("status", "held");

    await writeAudit({
        actorId: actor.id, targetUserId: userId, action: "damage.resolved",
        entityType: "damage_dispute", entityId: id,
        after: {
            amount: finalAmount,
            deposit_deduction: damage.deposit_deduction,
            outstanding_amount: damage.outstanding_amount,
        },
    });

    await notifyUser(userId, {
        template: "damage_dispute_resolved",
        title: "Damage Dispute Resolved",
        body: "Your damage dispute has been reviewed and resolved. Check your plan for the updated charge.",
        screen: "my-plan",
    });

    return damage;
}

export async function listDamages(filters: ListDamagesFilters): Promise<Paginated<DamageRow>> {
    let query = supabaseAdmin.from("damages").select(DAMAGE_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);

    // A damage reaches its booking through incident → rental → subscription,
    // so the booking filter resolves to that subscription's rentals first.
    if (filters.bookingId) {
        const rentalIds = await rentalIdsForBooking(filters.bookingId);
        if (rentalIds.length === 0) return paginate([], 0, filters);
        query = query.in("incidents.rental_id", rentalIds);
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(await toDamageRows((data ?? []) as unknown as RawDamageRow[]), count ?? 0, filters);
}

async function rentalIdsForBooking(bookingId: string): Promise<string[]> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription) return [];

    const { data: rentals, error: rentalsError } = await supabaseAdmin
        .from("rentals")
        .select("id")
        .eq("subscription_id", subscription.id);
    if (rentalsError) throw rentalsError;
    return (rentals ?? []).map((r) => r.id);
}

export async function getDamageById(id: string): Promise<DamageRow> {
    const [damage] = await toDamageRows([await requireDamage(id)]);
    return damage;
}

/**
 * Same lookup, ownership-checked — 404 (not 403, same reasoning as
 * disputeDamage) if the caller isn't staff and doesn't own it.
 */
export async function getDamageForActor(
    id: string,
    actor: AuthContext,
    callerIsStaff: boolean,
): Promise<DamageRow> {
    const row = await requireDamage(id);
    if (!callerIsStaff) {
        const { userId } = await damageContext(row);
        if (userId !== actor.id) throw notFound("Damage record not found.");
    }
    const [damage] = await toDamageRows([row]);
    return damage;
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

    const rentalIds = await rentalIdsForBooking(bookingId);
    if (rentalIds.length === 0) return [];

    const { data, error } = await supabaseAdmin
        .from("damages")
        .select(DAMAGE_COLUMNS)
        .in("incidents.rental_id", rentalIds)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return toDamageRows((data ?? []) as unknown as RawDamageRow[]);
}
