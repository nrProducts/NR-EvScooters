import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import {
    CancelRiderDiscountInput,
    ChargeRuleRow, CreateChargeRuleInput, CreateDiscountRuleInput, DiscountRuleRow,
    ListChargeRulesFilters, ListDiscountRulesFilters, ListRiderChargesFilters, ListRiderDiscountsFilters,
    RiderChargeRow, RiderDiscountRow, UpdateChargeRuleInput, UpdateDiscountRuleInput, WaiveRiderChargeInput,
} from "./billing.types";

const CHARGE_RULE_COLUMNS = `
    id, charge_code, charge_name, description, amount_type, amount, frequency_type, frequency_n,
    scope, vehicle_id, effective_from, effective_to, active, created_by, created_at, updated_at,
    vehicle:vehicles!charge_rules_vehicle_id_fkey(id, name, registration_number)
`;

const RIDER_CHARGE_COLUMNS = `
    id, booking_id, charge_rule_id, charge_code, charge_name, amount, billing_cycle_number,
    status, waived_amount, waived_reason, waived_at, invoice_id, created_at,
    waived_by:users!rider_charges_waived_by_fkey(id, full_name),
    bookings(id, vehicle_models(name), users!bookings_user_id_fkey(full_name, phone))
`;

const DISCOUNT_RULE_COLUMNS = `
    id, discount_code, discount_name, description, discount_type, value, frequency_type, frequency_n,
    scope, vehicle_id, effective_from, effective_to, active, created_by, created_at, updated_at,
    vehicle:vehicles!discount_rules_vehicle_id_fkey(id, name, registration_number)
`;

const RIDER_DISCOUNT_COLUMNS = `
    id, booking_id, discount_rule_id, discount_code, discount_name, discount_type, amount, billing_cycle_number,
    status, cancel_reason, cancelled_at, invoice_id, created_at,
    cancelled_by:users!rider_discounts_cancelled_by_fkey(id, full_name),
    bookings(id, vehicle_models(name), users!bookings_user_id_fkey(full_name, phone))
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawChargeRuleRow {
    id: string;
    charge_code: ChargeRuleRow["charge_code"];
    charge_name: string;
    description: string | null;
    amount_type: ChargeRuleRow["amount_type"];
    amount: number | string;
    frequency_type: ChargeRuleRow["frequency_type"];
    frequency_n: number | null;
    scope: ChargeRuleRow["scope"];
    vehicle_id: string | null;
    effective_from: string;
    effective_to: string | null;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    vehicle: unknown;
}

function toChargeRuleRow(row: RawChargeRuleRow): ChargeRuleRow {
    return { ...row, amount: Number(row.amount), vehicle: unwrap(row.vehicle) };
}

interface RawRiderChargeRow {
    id: string;
    booking_id: string;
    charge_rule_id: string | null;
    charge_code: RiderChargeRow["charge_code"];
    charge_name: string;
    amount: number | string;
    billing_cycle_number: number | null;
    status: RiderChargeRow["status"];
    waived_amount: number | string | null;
    waived_reason: string | null;
    waived_at: string | null;
    invoice_id: string | null;
    created_at: string;
    waived_by: unknown;
    bookings: unknown;
}

interface RawRiderChargeBooking {
    id: string;
    vehicle_models: unknown;
    users: unknown;
}

function toRiderChargeRow(row: RawRiderChargeRow): RiderChargeRow {
    const bookingRaw = unwrap<RawRiderChargeBooking>(row.bookings);
    const rider = bookingRaw ? unwrap<{ full_name: string; phone: string | null }>(bookingRaw.users) : null;
    return {
        ...row,
        amount: Number(row.amount),
        waived_amount: row.waived_amount === null ? null : Number(row.waived_amount),
        waived_by: unwrap(row.waived_by),
        booking: bookingRaw
            ? {
                id: bookingRaw.id,
                rider_name: rider?.full_name ?? null,
                rider_phone: rider?.phone ?? null,
                vehicle_model_name: unwrap<{ name: string }>(bookingRaw.vehicle_models)?.name ?? null,
            }
            : null,
    };
}

// ---------------------------------------------------------------------------
// Charge Rules — admin-configured. scope='vehicle' rows override the
// matching scope='global' row for the same charge_code; enforced both here
// (partial unique indexes on the table) and in apply_billing_cycle_charges's
// own "vehicle row wins" ORDER BY.
// ---------------------------------------------------------------------------

export async function listChargeRules(filters: ListChargeRulesFilters): Promise<Paginated<ChargeRuleRow>> {
    let query = supabaseAdmin.from("charge_rules").select(CHARGE_RULE_COLUMNS, { count: "exact" });
    if (filters.chargeCode) query = query.eq("charge_code", filters.chargeCode);
    if (filters.scope) query = query.eq("scope", filters.scope);
    if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
    if (filters.active !== undefined) query = query.eq("active", filters.active);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawChargeRuleRow[]).map(toChargeRuleRow), count ?? 0, filters);
}

export async function getChargeRuleById(id: string): Promise<ChargeRuleRow> {
    const { data, error } = await supabaseAdmin.from("charge_rules").select(CHARGE_RULE_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Charge rule not found.");
    return toChargeRuleRow(data as unknown as RawChargeRuleRow);
}

export async function createChargeRule(input: CreateChargeRuleInput, actor: AuthContext): Promise<ChargeRuleRow> {
    const { data, error } = await supabaseAdmin
        .from("charge_rules")
        .insert({
            charge_code: input.charge_code,
            charge_name: input.charge_name,
            description: input.description ?? null,
            amount_type: input.amount_type,
            amount: input.amount,
            frequency_type: input.frequency_type,
            frequency_n: input.frequency_n ?? null,
            scope: input.scope,
            vehicle_id: input.scope === "vehicle" ? input.vehicle_id : null,
            effective_from: input.effective_from,
            effective_to: input.effective_to ?? null,
            active: input.active ?? true,
            created_by: actor.id,
        })
        .select(CHARGE_RULE_COLUMNS)
        .single();
    if (error) {
        // Partial unique index violation — an active rule already exists at this scope for this charge code.
        if (error.code === "23505") {
            throw conflict(
                input.scope === "vehicle"
                    ? "This vehicle already has an active rule for this charge type. Edit or deactivate it first."
                    : "An active global rule already exists for this charge type. Edit or deactivate it first.",
            );
        }
        throw error;
    }
    const rule = toChargeRuleRow(data as unknown as RawChargeRuleRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "charge_rule.created", entityType: "charge_rule", entityId: rule.id,
        after: {
            charge_code: rule.charge_code, amount: rule.amount, frequency_type: rule.frequency_type,
            frequency_n: rule.frequency_n, scope: rule.scope, vehicle_id: rule.vehicle_id,
        },
    });

    return rule;
}

export async function updateChargeRule(id: string, patch: UpdateChargeRuleInput, actor: AuthContext): Promise<ChargeRuleRow> {
    const before = await getChargeRuleById(id);

    const { data, error } = await supabaseAdmin
        .from("charge_rules")
        .update(patch)
        .eq("id", id)
        .select(CHARGE_RULE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Charge rule not found.");
    const rule = toChargeRuleRow(data as unknown as RawChargeRuleRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "charge_rule.updated", entityType: "charge_rule", entityId: rule.id,
        before: { amount: before.amount, active: before.active, frequency_n: before.frequency_n },
        after: patch,
    });

    return rule;
}

// ---------------------------------------------------------------------------
// Rider Charges — materialized instances. Never deleted; waiving keeps the
// original amount on record alongside the waived amount and reason.
// ---------------------------------------------------------------------------

export async function listRiderCharges(filters: ListRiderChargesFilters): Promise<Paginated<RiderChargeRow>> {
    let query = supabaseAdmin.from("rider_charges").select(RIDER_CHARGE_COLUMNS, { count: "exact" });
    if (filters.bookingId) query = query.eq("booking_id", filters.bookingId);
    if (filters.status) query = query.eq("status", filters.status);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawRiderChargeRow[]).map(toRiderChargeRow), count ?? 0, filters);
}

export async function waiveRiderCharge(id: string, input: WaiveRiderChargeInput, actor: AuthContext): Promise<RiderChargeRow> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("rider_charges")
        .select("id, status, amount, booking_id")
        .eq("id", id)
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Rider charge not found.");
    if (existing.status === "waived" || existing.status === "cancelled" || existing.status === "paid") {
        throw businessRule(`This charge is already ${existing.status} and can't be waived.`);
    }
    if (input.waived_amount > Number(existing.amount)) {
        throw businessRule("Waived amount can't exceed the original charge amount.");
    }

    const { data, error } = await supabaseAdmin
        .from("rider_charges")
        .update({
            status: "waived", waived_amount: input.waived_amount, waived_reason: input.reason,
            waived_by: actor.id, waived_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(RIDER_CHARGE_COLUMNS)
        .single();
    if (error) throw error;
    const charge = toRiderChargeRow(data as unknown as RawRiderChargeRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "rider_charge.waived",
        entityType: "rider_charge", entityId: id,
        before: { status: existing.status, amount: Number(existing.amount) },
        after: { status: "waived", waived_amount: input.waived_amount, reason: input.reason },
    });

    return charge;
}

// ---------------------------------------------------------------------------
// Weekly invoice generation — thin wrapper around the DB's own
// fn_generate_weekly_invoice, the single source of truth also called by the
// payment-overdue-sweep edge function. Exposed here for admin on-demand
// regeneration and so the pure eligibility math stays testable from Node
// (see billing.eligibility spec).
// ---------------------------------------------------------------------------

export async function generateWeeklyInvoice(bookingId: string): Promise<{ invoiceId: string }> {
    const { data, error } = await supabaseAdmin.rpc("fn_generate_weekly_invoice", { p_booking_id: bookingId });
    if (error) throw error;
    return { invoiceId: data as string };
}

/**
 * Pure eligibility check, mirroring the DB function's own `p_cycle_number %
 * frequency_n = 0` rule — exported so this exact math is unit-tested from
 * Node (same reason computeLateReturnPenalty/computeCancellationCharge are
 * exported), even though the DB function is the one actually enforced.
 */
export function isCycleEligibleForEveryNCharge(cycleNumber: number, everyN: number): boolean {
    if (everyN <= 0) return false;
    return cycleNumber % everyN === 0;
}

// ---------------------------------------------------------------------------
// Discount Rules — mirrors Charge Rules exactly (same override priority,
// same audit convention). See 20260817120000_discount_rules_engine.sql.
// ---------------------------------------------------------------------------

interface RawDiscountRuleRow {
    id: string;
    discount_code: DiscountRuleRow["discount_code"];
    discount_name: string;
    description: string | null;
    discount_type: DiscountRuleRow["discount_type"];
    value: number | string;
    frequency_type: DiscountRuleRow["frequency_type"];
    frequency_n: number | null;
    scope: DiscountRuleRow["scope"];
    vehicle_id: string | null;
    effective_from: string;
    effective_to: string | null;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    vehicle: unknown;
}

function toDiscountRuleRow(row: RawDiscountRuleRow): DiscountRuleRow {
    return { ...row, value: Number(row.value), vehicle: unwrap(row.vehicle) };
}

interface RawRiderDiscountRow {
    id: string;
    booking_id: string;
    discount_rule_id: string | null;
    discount_code: RiderDiscountRow["discount_code"];
    discount_name: string;
    discount_type: RiderDiscountRow["discount_type"];
    amount: number | string;
    billing_cycle_number: number | null;
    status: RiderDiscountRow["status"];
    cancel_reason: string | null;
    cancelled_at: string | null;
    invoice_id: string | null;
    created_at: string;
    cancelled_by: unknown;
    bookings: unknown;
}

function toRiderDiscountRow(row: RawRiderDiscountRow): RiderDiscountRow {
    const bookingRaw = unwrap<RawRiderChargeBooking>(row.bookings);
    const rider = bookingRaw ? unwrap<{ full_name: string; phone: string | null }>(bookingRaw.users) : null;
    return {
        ...row,
        amount: Number(row.amount),
        cancelled_by: unwrap(row.cancelled_by),
        booking: bookingRaw
            ? {
                id: bookingRaw.id,
                rider_name: rider?.full_name ?? null,
                rider_phone: rider?.phone ?? null,
                vehicle_model_name: unwrap<{ name: string }>(bookingRaw.vehicle_models)?.name ?? null,
            }
            : null,
    };
}

export async function listDiscountRules(filters: ListDiscountRulesFilters): Promise<Paginated<DiscountRuleRow>> {
    let query = supabaseAdmin.from("discount_rules").select(DISCOUNT_RULE_COLUMNS, { count: "exact" });
    if (filters.discountCode) query = query.eq("discount_code", filters.discountCode);
    if (filters.scope) query = query.eq("scope", filters.scope);
    if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);
    if (filters.active !== undefined) query = query.eq("active", filters.active);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawDiscountRuleRow[]).map(toDiscountRuleRow), count ?? 0, filters);
}

export async function getDiscountRuleById(id: string): Promise<DiscountRuleRow> {
    const { data, error } = await supabaseAdmin.from("discount_rules").select(DISCOUNT_RULE_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Discount rule not found.");
    return toDiscountRuleRow(data as unknown as RawDiscountRuleRow);
}

export async function createDiscountRule(input: CreateDiscountRuleInput, actor: AuthContext): Promise<DiscountRuleRow> {
    const { data, error } = await supabaseAdmin
        .from("discount_rules")
        .insert({
            discount_code: input.discount_code,
            discount_name: input.discount_name,
            description: input.description ?? null,
            discount_type: input.discount_type,
            value: input.value,
            frequency_type: input.frequency_type,
            frequency_n: input.frequency_n ?? null,
            scope: input.scope,
            vehicle_id: input.scope === "vehicle" ? input.vehicle_id : null,
            effective_from: input.effective_from,
            effective_to: input.effective_to ?? null,
            active: input.active ?? true,
            created_by: actor.id,
        })
        .select(DISCOUNT_RULE_COLUMNS)
        .single();
    if (error) {
        if (error.code === "23505") {
            throw conflict(
                input.scope === "vehicle"
                    ? "This vehicle already has an active rule for this discount type. Edit or deactivate it first."
                    : "An active global rule already exists for this discount type. Edit or deactivate it first.",
            );
        }
        throw error;
    }
    const rule = toDiscountRuleRow(data as unknown as RawDiscountRuleRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "discount_rule.created", entityType: "discount_rule", entityId: rule.id,
        after: {
            discount_code: rule.discount_code, value: rule.value, frequency_type: rule.frequency_type,
            frequency_n: rule.frequency_n, scope: rule.scope, vehicle_id: rule.vehicle_id,
        },
    });

    return rule;
}

export async function updateDiscountRule(id: string, patch: UpdateDiscountRuleInput, actor: AuthContext): Promise<DiscountRuleRow> {
    const before = await getDiscountRuleById(id);

    const { data, error } = await supabaseAdmin
        .from("discount_rules")
        .update(patch)
        .eq("id", id)
        .select(DISCOUNT_RULE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Discount rule not found.");
    const rule = toDiscountRuleRow(data as unknown as RawDiscountRuleRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "discount_rule.updated", entityType: "discount_rule", entityId: rule.id,
        before: { value: before.value, active: before.active, frequency_n: before.frequency_n },
        after: patch,
    });

    return rule;
}

// ---------------------------------------------------------------------------
// Rider Discounts — materialized instances. Never deleted; cancelling keeps
// the original amount on record alongside the reason, same convention as
// waiving a rider charge.
// ---------------------------------------------------------------------------

export async function listRiderDiscounts(filters: ListRiderDiscountsFilters): Promise<Paginated<RiderDiscountRow>> {
    let query = supabaseAdmin.from("rider_discounts").select(RIDER_DISCOUNT_COLUMNS, { count: "exact" });
    if (filters.bookingId) query = query.eq("booking_id", filters.bookingId);
    if (filters.status) query = query.eq("status", filters.status);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawRiderDiscountRow[]).map(toRiderDiscountRow), count ?? 0, filters);
}

export async function cancelRiderDiscount(id: string, input: CancelRiderDiscountInput, actor: AuthContext): Promise<RiderDiscountRow> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("rider_discounts")
        .select("id, status, amount")
        .eq("id", id)
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Rider discount not found.");
    if (existing.status === "cancelled") {
        throw businessRule("This discount is already cancelled.");
    }

    const { data, error } = await supabaseAdmin
        .from("rider_discounts")
        .update({
            status: "cancelled", cancel_reason: input.reason,
            cancelled_by: actor.id, cancelled_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(RIDER_DISCOUNT_COLUMNS)
        .single();
    if (error) throw error;
    const discount = toRiderDiscountRow(data as unknown as RawRiderDiscountRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "rider_discount.cancelled",
        entityType: "rider_discount", entityId: id,
        before: { status: existing.status, amount: Number(existing.amount) },
        after: { status: "cancelled", reason: input.reason },
    });

    return discount;
}
