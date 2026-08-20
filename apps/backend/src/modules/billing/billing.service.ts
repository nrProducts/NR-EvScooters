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

/**
 * Billing rules and the adjustments they produce.
 *
 * This module used to be two mirrored halves, one for charges and one for
 * discounts, over four tables. There are two tables now — `pricing_rules` and
 * `subscription_adjustments` — with a `kind` column and signed amounts, so the
 * halves are the same code with a different `kind` filter.
 *
 * Both public vocabularies are preserved (charge_code/discount_code,
 * amount/value, waive/cancel) because the console has two screens and Stage 10
 * is where they merge. The mapping is confined to the converters below.
 */

const RULE_COLUMNS = `
    id, code, name, description, kind, amount_type, amount, frequency, frequency_n,
    scope, scope_ref_id, effective_from, effective_to, is_active,
    created_by_user_id, created_at, updated_at
`;

const ADJUSTMENT_COLUMNS = `
    id, subscription_id, subscription_period_id, pricing_rule_id, kind,
    code_snapshot, name_snapshot, amount, status,
    void_reason, voided_at, created_at,
    voided_by:users!voided_by_user_id(id, full_name),
    subscription_periods(sequence_number),
    subscriptions(
        booking_id,
        users(full_name, phone),
        plans(vehicle_models(name))
    )
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawRuleRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    kind: "charge" | "discount";
    amount_type: ChargeRuleRow["amount_type"];
    amount: number | string;
    frequency: ChargeRuleRow["frequency_type"];
    frequency_n: number | null;
    scope: ChargeRuleRow["scope"];
    scope_ref_id: string | null;
    effective_from: string;
    effective_to: string | null;
    is_active: boolean;
    created_by_user_id: string | null;
    created_at: string;
    updated_at: string | null;
}

/**
 * The vehicle a `scope = 'vehicle'` rule points at.
 *
 * `scope_ref_id` is a plain uuid with no foreign key — it can address a plan,
 * a model, a vehicle or a subscription depending on `scope`, and Postgres
 * cannot express a conditional FK. So the vehicle cannot be embedded and is
 * resolved in a second, batched query instead.
 */
async function vehiclesFor(ruleRows: RawRuleRow[]) {
    const ids = ruleRows
        .filter((r) => r.scope === "vehicle" && r.scope_ref_id)
        .map((r) => r.scope_ref_id as string);
    const map = new Map<string, { id: string; name: string; registration_number: string }>();
    if (ids.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, display_name, registration_number, vehicle_models(name)")
        .in("id", [...new Set(ids)]);
    if (error) throw error;

    for (const v of data ?? []) {
        map.set(v.id, {
            id: v.id,
            name: v.display_name ?? unwrap<{ name: string }>(v.vehicle_models)?.name ?? "",
            registration_number: v.registration_number,
        });
    }
    return map;
}

function toChargeRuleRow(
    row: RawRuleRow,
    vehicles: Map<string, { id: string; name: string; registration_number: string }>,
): ChargeRuleRow {
    return {
        id: row.id,
        charge_code: row.code,
        charge_name: row.name,
        description: row.description,
        amount_type: row.amount_type,
        amount: Number(row.amount),
        frequency_type: row.frequency,
        frequency_n: row.frequency_n,
        scope: row.scope,
        vehicle_id: row.scope === "vehicle" ? row.scope_ref_id : null,
        vehicle: row.scope === "vehicle" && row.scope_ref_id
            ? vehicles.get(row.scope_ref_id) ?? null
            : null,
        effective_from: row.effective_from,
        effective_to: row.effective_to,
        active: row.is_active,
        created_by: row.created_by_user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function toDiscountRuleRow(
    row: RawRuleRow,
    vehicles: Map<string, { id: string; name: string; registration_number: string }>,
): DiscountRuleRow {
    const charge = toChargeRuleRow(row, vehicles);
    return {
        id: charge.id,
        discount_code: charge.charge_code,
        discount_name: charge.charge_name,
        description: charge.description,
        discount_type: charge.amount_type,
        value: charge.amount,
        frequency_type: charge.frequency_type,
        frequency_n: charge.frequency_n,
        scope: charge.scope,
        vehicle_id: charge.vehicle_id,
        vehicle: charge.vehicle,
        effective_from: charge.effective_from,
        effective_to: charge.effective_to,
        active: charge.active,
        created_by: charge.created_by,
        created_at: charge.created_at,
        updated_at: charge.updated_at,
    };
}

interface RawAdjustmentRow {
    id: string;
    subscription_id: string;
    subscription_period_id: string | null;
    pricing_rule_id: string | null;
    kind: "charge" | "discount";
    code_snapshot: string;
    name_snapshot: string;
    amount: number | string;
    status: RiderChargeRow["status"];
    void_reason: string | null;
    voided_at: string | null;
    created_at: string;
    voided_by: unknown;
    subscription_periods: unknown;
    subscriptions: unknown;
}

function adjustmentBooking(row: RawAdjustmentRow) {
    const subscription = unwrap<{ booking_id: string; users: unknown; plans: unknown }>(row.subscriptions);
    if (!subscription) return { bookingId: "", summary: null };
    const rider = unwrap<{ full_name: string; phone: string | null }>(subscription.users);
    const plan = unwrap<{ vehicle_models: unknown }>(subscription.plans);
    return {
        bookingId: subscription.booking_id,
        summary: {
            id: subscription.booking_id,
            rider_name: rider?.full_name ?? null,
            rider_phone: rider?.phone ?? null,
            vehicle_model_name: unwrap<{ name: string }>(plan?.vehicle_models)?.name ?? null,
        },
    };
}

function toRiderChargeRow(row: RawAdjustmentRow): RiderChargeRow {
    const { bookingId, summary } = adjustmentBooking(row);
    return {
        id: row.id,
        booking_id: bookingId,
        subscription_id: row.subscription_id,
        charge_rule_id: row.pricing_rule_id,
        charge_code: row.code_snapshot,
        charge_name: row.name_snapshot,
        // Charges are stored positive, but Math.abs keeps this honest if a
        // credit is ever recorded under kind='charge'.
        amount: Math.abs(Number(row.amount)),
        billing_cycle_number: unwrap<{ sequence_number: number }>(row.subscription_periods)?.sequence_number ?? null,
        status: row.status,
        waived_amount: row.status === "voided" ? Math.abs(Number(row.amount)) : null,
        waived_reason: row.void_reason,
        waived_by: unwrap(row.voided_by),
        waived_at: row.voided_at,
        // An adjustment reaches an invoice through invoice_items, not a
        // column; the list UI only uses this to show "billed or not", which
        // `status = 'invoiced'` already says.
        invoice_id: null,
        created_at: row.created_at,
        booking: summary,
    };
}

function toRiderDiscountRow(row: RawAdjustmentRow): RiderDiscountRow {
    const charge = toRiderChargeRow(row);
    return {
        id: charge.id,
        booking_id: charge.booking_id,
        subscription_id: charge.subscription_id,
        discount_rule_id: charge.charge_rule_id,
        discount_code: charge.charge_code,
        discount_name: charge.charge_name,
        discount_type: "fixed",
        amount: charge.amount,
        billing_cycle_number: charge.billing_cycle_number,
        status: charge.status,
        cancel_reason: charge.waived_reason,
        cancelled_by: charge.waived_by,
        cancelled_at: charge.waived_at,
        invoice_id: charge.invoice_id,
        created_at: charge.created_at,
        booking: charge.booking,
    };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

async function listRules(
    kind: "charge" | "discount",
    filters: { page: number; pageSize: number; code?: string; scope?: string; vehicleId?: string; active?: boolean },
) {
    let query = supabaseAdmin
        .from("pricing_rules")
        .select(RULE_COLUMNS, { count: "exact" })
        .eq("kind", kind);

    if (filters.code) query = query.eq("code", filters.code);
    if (filters.scope) query = query.eq("scope", filters.scope as ChargeRuleRow["scope"]);
    if (filters.vehicleId) query = query.eq("scope_ref_id", filters.vehicleId);
    if (filters.active !== undefined) query = query.eq("is_active", filters.active);

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawRuleRow[];
    return { rows, vehicles: await vehiclesFor(rows), count: count ?? 0 };
}

export async function listChargeRules(filters: ListChargeRulesFilters): Promise<Paginated<ChargeRuleRow>> {
    const { rows, vehicles, count } = await listRules("charge", {
        ...filters, code: filters.chargeCode,
    });
    return paginate(rows.map((r) => toChargeRuleRow(r, vehicles)), count, filters);
}

async function readRule(id: string, kind: "charge" | "discount") {
    const { data, error } = await supabaseAdmin
        .from("pricing_rules")
        .select(RULE_COLUMNS)
        .eq("id", id)
        .eq("kind", kind)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound(kind === "charge" ? "Charge rule not found." : "Discount rule not found.");
    const row = data as unknown as RawRuleRow;
    return { row, vehicles: await vehiclesFor([row]) };
}

export async function getChargeRuleById(id: string): Promise<ChargeRuleRow> {
    const { row, vehicles } = await readRule(id, "charge");
    return toChargeRuleRow(row, vehicles);
}

/**
 * `pricing_rules.code` is globally UNIQUE, which is stricter than the old
 * partial indexes: there was one active rule per (code, scope) before, so a
 * global `transaction_fee` and a vehicle-scoped one could coexist under the
 * same code. They cannot now.
 *
 * The scoped rule therefore carries a qualified code — `<code>:<ref>` — the
 * same convention the per-subscription late-fee override uses. That keeps the
 * uniqueness meaningful (one rule per code) while still allowing an override.
 */
function ruleCodeFor(code: string, scope: string, refId: string | null | undefined): string {
    return scope === "global" || !refId ? code : `${code}:${refId}`;
}

async function createRule(
    kind: "charge" | "discount",
    input: {
        code: string; name: string; description?: string | null;
        amountType: ChargeRuleRow["amount_type"]; amount: number;
        frequency: ChargeRuleRow["frequency_type"]; frequencyN?: number | null;
        scope: ChargeRuleRow["scope"]; refId?: string | null;
        effectiveFrom?: string; effectiveTo?: string | null; active?: boolean;
    },
    actor: AuthContext,
) {
    const { data, error } = await supabaseAdmin
        .from("pricing_rules")
        .insert({
            code: ruleCodeFor(input.code, input.scope, input.refId),
            name: input.name,
            description: input.description ?? null,
            kind,
            amount_type: input.amountType,
            // Discounts are stored NEGATIVE. That is the whole point of the
            // merge: one signed column means a period's adjustments sum
            // directly, with nothing to remember to subtract.
            amount: kind === "discount" ? -Math.abs(input.amount) : Math.abs(input.amount),
            frequency: input.frequency,
            frequency_n: input.frequencyN ?? null,
            scope: input.scope,
            scope_ref_id: input.scope === "global" ? null : input.refId ?? null,
            ...(input.effectiveFrom ? { effective_from: input.effectiveFrom } : {}),
            effective_to: input.effectiveTo ?? null,
            is_active: input.active ?? true,
            created_by_user_id: actor.id,
        })
        .select(RULE_COLUMNS)
        .single();

    if (error) {
        if (error.code === "23505") {
            throw conflict(
                input.scope === "global"
                    ? "A rule already exists for this code. Edit or deactivate it first."
                    : "A rule already exists for this code at this scope. Edit or deactivate it first.",
            );
        }
        throw error;
    }

    const row = data as unknown as RawRuleRow;
    return { row, vehicles: await vehiclesFor([row]) };
}

export async function createChargeRule(
    input: CreateChargeRuleInput,
    actor: AuthContext,
): Promise<ChargeRuleRow> {
    const { row, vehicles } = await createRule("charge", {
        code: input.charge_code,
        name: input.charge_name,
        description: input.description,
        amountType: input.amount_type,
        amount: input.amount,
        frequency: input.frequency_type,
        frequencyN: input.frequency_n,
        scope: input.scope,
        refId: input.vehicle_id,
        effectiveFrom: input.effective_from,
        effectiveTo: input.effective_to,
        active: input.active,
    }, actor);

    const rule = toChargeRuleRow(row, vehicles);
    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "pricing_rule.created", entityType: "pricing_rule", entityId: rule.id,
        after: {
            kind: "charge", code: rule.charge_code, amount: rule.amount,
            frequency: rule.frequency_type, frequency_n: rule.frequency_n,
            scope: rule.scope, scope_ref_id: rule.vehicle_id,
        },
    });
    return rule;
}

async function updateRule(
    id: string,
    kind: "charge" | "discount",
    patch: Record<string, unknown>,
) {
    const { data, error } = await supabaseAdmin
        .from("pricing_rules")
        .update(patch as never)
        .eq("id", id)
        .eq("kind", kind)
        .select(RULE_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound(kind === "charge" ? "Charge rule not found." : "Discount rule not found.");
    const row = data as unknown as RawRuleRow;
    return { row, vehicles: await vehiclesFor([row]) };
}

export async function updateChargeRule(
    id: string,
    patch: UpdateChargeRuleInput,
    actor: AuthContext,
): Promise<ChargeRuleRow> {
    const before = await getChargeRuleById(id);

    const columns: Record<string, unknown> = {};
    if (patch.charge_name !== undefined) columns.name = patch.charge_name;
    if (patch.description !== undefined) columns.description = patch.description;
    if (patch.amount_type !== undefined) columns.amount_type = patch.amount_type;
    if (patch.amount !== undefined) columns.amount = Math.abs(patch.amount);
    if (patch.frequency_type !== undefined) columns.frequency = patch.frequency_type;
    if (patch.frequency_n !== undefined) columns.frequency_n = patch.frequency_n;
    if (patch.effective_from !== undefined) columns.effective_from = patch.effective_from;
    if (patch.effective_to !== undefined) columns.effective_to = patch.effective_to;
    if (patch.active !== undefined) columns.is_active = patch.active;

    if (Object.keys(columns).length === 0) return before;

    const { row, vehicles } = await updateRule(id, "charge", columns);
    const rule = toChargeRuleRow(row, vehicles);

    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "pricing_rule.updated", entityType: "pricing_rule", entityId: rule.id,
        before: { amount: before.amount, active: before.active, frequency_n: before.frequency_n },
        after: patch,
    });
    return rule;
}

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

async function listAdjustments(
    kind: "charge" | "discount",
    filters: { page: number; pageSize: number; bookingId?: string; status?: string },
) {
    let query = supabaseAdmin
        .from("subscription_adjustments")
        .select(ADJUSTMENT_COLUMNS, { count: "exact" })
        .eq("kind", kind);

    if (filters.status) query = query.eq("status", filters.status as RiderChargeRow["status"]);

    // The console filters by booking; the adjustment hangs off the
    // subscription, so the booking is resolved to a subscription first.
    if (filters.bookingId) {
        const { data: sub, error: subError } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("booking_id", filters.bookingId)
            .maybeSingle();
        if (subError) throw subError;
        if (!sub) return { rows: [] as RawAdjustmentRow[], count: 0 };
        query = query.eq("subscription_id", sub.id);
    }

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;

    return { rows: (data ?? []) as unknown as RawAdjustmentRow[], count: count ?? 0 };
}

export async function listRiderCharges(
    filters: ListRiderChargesFilters,
): Promise<Paginated<RiderChargeRow>> {
    const { rows, count } = await listAdjustments("charge", filters);
    return paginate(rows.map(toRiderChargeRow), count, filters);
}

/**
 * Waives a charge.
 *
 * A FULL waiver voids the adjustment. A PARTIAL one cannot — the amount is
 * immutable, and rewriting it would erase what the rider was originally
 * charged — so it writes a second, negative adjustment for the credit and
 * leaves the original standing. That is strictly better bookkeeping than the
 * old `waived_amount` column, which quietly replaced the figure.
 */
export async function waiveRiderCharge(
    id: string,
    input: WaiveRiderChargeInput,
    actor: AuthContext,
): Promise<RiderChargeRow> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("subscription_adjustments")
        .select("id, subscription_id, subscription_period_id, status, amount, code_snapshot, name_snapshot")
        .eq("id", id)
        .eq("kind", "charge")
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Rider charge not found.");
    if (existing.status === "voided" || existing.status === "settled") {
        throw businessRule(`This charge is already ${existing.status} and can't be waived.`);
    }

    const original = Math.abs(Number(existing.amount));
    if (input.waived_amount > original) {
        throw businessRule("Waived amount can't exceed the original charge amount.");
    }

    const now = new Date().toISOString();

    if (input.waived_amount >= original) {
        const { error } = await supabaseAdmin
            .from("subscription_adjustments")
            .update({
                status: "voided",
                void_reason: input.reason,
                voided_at: now,
                voided_by_user_id: actor.id,
            })
            .eq("id", id)
            .in("status", ["pending", "invoiced"]);
        if (error) throw error;
    } else {
        const { error } = await supabaseAdmin.from("subscription_adjustments").insert({
            subscription_id: existing.subscription_id,
            subscription_period_id: existing.subscription_period_id,
            kind: "discount",
            code_snapshot: `waiver:${existing.code_snapshot}`,
            name_snapshot: `Partial waiver — ${existing.name_snapshot}`,
            amount: -Math.abs(input.waived_amount),
            status: "pending",
        });
        if (error) throw error;
    }

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "subscription_adjustment.waived",
        entityType: "subscription_adjustment", entityId: id,
        before: { status: existing.status, amount: original },
        after: {
            waived_amount: input.waived_amount,
            reason: input.reason,
            partial: input.waived_amount < original,
        },
    });

    const { data, error } = await supabaseAdmin
        .from("subscription_adjustments")
        .select(ADJUSTMENT_COLUMNS)
        .eq("id", id)
        .single();
    if (error) throw error;
    return toRiderChargeRow(data as unknown as RawAdjustmentRow);
}

// ---------------------------------------------------------------------------
// Period invoicing
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around `generate_period_invoice()` — the database function that
 * resolves the applicable pricing rules, writes the adjustments and then the
 * invoice and its items, all idempotently.
 *
 * Was `fn_generate_weekly_invoice(booking_id)`. It takes a SUBSCRIPTION now,
 * and resolves the period itself: "weekly" was never true (plans can be daily
 * or monthly), and the booking was the wrong handle once the agreement moved.
 */
export async function generatePeriodInvoice(subscriptionId: string): Promise<{ invoiceId: string }> {
    const { data: period, error: periodError } = await supabaseAdmin
        .from("v_subscription_current_period")
        .select("subscription_period_id")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();
    if (periodError) throw periodError;
    if (!period?.subscription_period_id) {
        throw businessRule("This subscription has no current billing period to invoice.");
    }

    const { data, error } = await supabaseAdmin.rpc("generate_period_invoice", {
        p_subscription_period_id: period.subscription_period_id,
    });
    if (error) throw error;
    return { invoiceId: data as string };
}

/**
 * Pure eligibility check, mirroring the DB function's `sequence_number %
 * frequency_n = 0` rule — exported so this exact math is unit-tested from
 * Node, even though the DB function is the one actually enforced.
 */
export function isCycleEligibleForEveryNCharge(cycleNumber: number, everyN: number): boolean {
    if (everyN <= 0) return false;
    return cycleNumber % everyN === 0;
}

// ---------------------------------------------------------------------------
// Discounts — same tables, kind='discount'
// ---------------------------------------------------------------------------

export async function listDiscountRules(
    filters: ListDiscountRulesFilters,
): Promise<Paginated<DiscountRuleRow>> {
    const { rows, vehicles, count } = await listRules("discount", {
        ...filters, code: filters.discountCode,
    });
    return paginate(rows.map((r) => toDiscountRuleRow(r, vehicles)), count, filters);
}

export async function getDiscountRuleById(id: string): Promise<DiscountRuleRow> {
    const { row, vehicles } = await readRule(id, "discount");
    return toDiscountRuleRow(row, vehicles);
}

export async function createDiscountRule(
    input: CreateDiscountRuleInput,
    actor: AuthContext,
): Promise<DiscountRuleRow> {
    const { row, vehicles } = await createRule("discount", {
        code: input.discount_code,
        name: input.discount_name,
        description: input.description,
        amountType: input.discount_type,
        amount: input.value,
        frequency: input.frequency_type,
        frequencyN: input.frequency_n,
        scope: input.scope,
        refId: input.vehicle_id,
        effectiveFrom: input.effective_from,
        effectiveTo: input.effective_to,
        active: input.active,
    }, actor);

    const rule = toDiscountRuleRow(row, vehicles);
    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "pricing_rule.created", entityType: "pricing_rule", entityId: rule.id,
        after: {
            kind: "discount", code: rule.discount_code, value: rule.value,
            frequency: rule.frequency_type, scope: rule.scope,
        },
    });
    return rule;
}

export async function updateDiscountRule(
    id: string,
    patch: UpdateDiscountRuleInput,
    actor: AuthContext,
): Promise<DiscountRuleRow> {
    const before = await getDiscountRuleById(id);

    const columns: Record<string, unknown> = {};
    if (patch.discount_name !== undefined) columns.name = patch.discount_name;
    if (patch.description !== undefined) columns.description = patch.description;
    if (patch.discount_type !== undefined) columns.amount_type = patch.discount_type;
    // Stored negative — see createRule().
    if (patch.value !== undefined) columns.amount = -Math.abs(patch.value);
    if (patch.frequency_type !== undefined) columns.frequency = patch.frequency_type;
    if (patch.frequency_n !== undefined) columns.frequency_n = patch.frequency_n;
    if (patch.effective_from !== undefined) columns.effective_from = patch.effective_from;
    if (patch.effective_to !== undefined) columns.effective_to = patch.effective_to;
    if (patch.active !== undefined) columns.is_active = patch.active;

    if (Object.keys(columns).length === 0) return before;

    const { row, vehicles } = await updateRule(id, "discount", columns);
    const rule = toDiscountRuleRow(row, vehicles);

    await writeAudit({
        actorId: actor.id, targetUserId: null,
        action: "pricing_rule.updated", entityType: "pricing_rule", entityId: rule.id,
        before: { value: before.value, active: before.active },
        after: patch,
    });
    return rule;
}

export async function listRiderDiscounts(
    filters: ListRiderDiscountsFilters,
): Promise<Paginated<RiderDiscountRow>> {
    const { rows, count } = await listAdjustments("discount", filters);
    return paginate(rows.map(toRiderDiscountRow), count, filters);
}

export async function cancelRiderDiscount(
    id: string,
    input: CancelRiderDiscountInput,
    actor: AuthContext,
): Promise<RiderDiscountRow> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("subscription_adjustments")
        .select("id, status, amount")
        .eq("id", id)
        .eq("kind", "discount")
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Rider discount not found.");
    if (existing.status === "voided" || existing.status === "settled") {
        throw businessRule(`This discount is already ${existing.status} and can't be cancelled.`);
    }

    const { error } = await supabaseAdmin
        .from("subscription_adjustments")
        .update({
            status: "voided",
            void_reason: input.reason,
            voided_at: new Date().toISOString(),
            voided_by_user_id: actor.id,
        })
        .eq("id", id)
        .in("status", ["pending", "invoiced"]);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "subscription_adjustment.waived",
        entityType: "subscription_adjustment", entityId: id,
        before: { status: existing.status, amount: Math.abs(Number(existing.amount)) },
        after: { status: "voided", reason: input.reason },
    });

    const { data, error: readError } = await supabaseAdmin
        .from("subscription_adjustments")
        .select(ADJUSTMENT_COLUMNS)
        .eq("id", id)
        .single();
    if (readError) throw readError;
    return toRiderDiscountRow(data as unknown as RawAdjustmentRow);
}
