import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import { CreatePlanInput, ListPlansFilters, PlanRow, UpdatePlanInput } from "./plans.types";

/**
 * Plan CRUD.
 *
 * The column renames are mechanical: `price` → `price_amount`,
 * `billing_cycle` → `billing_period`, `active` → `is_active`. Two things have
 * no successor — `included_minutes`, which nothing ever wrote, and the fourth
 * `yearly` billing cycle, which no plan used.
 *
 * The recurring-billing pause/resume engine that used to occupy the second
 * half of this file has moved to modules/subscriptions/subscriptions.service.ts.
 * It was never really about plans: it manipulated a booking's plan STATE, and
 * that state is a `subscriptions` row now, with its pauses recorded in
 * `subscription_pauses` rather than `plan_pause_events`.
 */

const PLAN_COLUMNS = `
    id, name, billing_period, price_amount, duration_days, deposit_amount,
    vehicle_model_id, is_active, created_at, updated_at
`;

interface RawPlanRow {
    id: string;
    name: string;
    billing_period: PlanRow["billing_cycle"];
    price_amount: number | string;
    duration_days: number;
    deposit_amount: number | string;
    vehicle_model_id: string;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
}

function toPlanRow(row: RawPlanRow): PlanRow {
    return {
        id: row.id,
        name: row.name,
        billing_cycle: row.billing_period,
        price: Number(row.price_amount),
        included_minutes: null,
        duration_days: row.duration_days,
        deposit_amount: Number(row.deposit_amount),
        vehicle_model_id: row.vehicle_model_id,
        active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// ---------------------------------------------------------------------------
// Admin CRUD — plans were previously seed-only; do not hardcode price/
// duration/deposit per the spec, hence this module.
// ---------------------------------------------------------------------------

/**
 * Every active vehicle model, for the plan editor's model picker.
 *
 * Deliberately NOT vehicle-catalog's listVehicleModels(): that endpoint is
 * rider-browse-only and filters to models which already have an active plan,
 * which would make it impossible to ever create a model's first plan through
 * the admin UI. This has no such filter.
 */
export async function listVehicleModelOptions(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_models")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
}

export async function listPlans(filters: ListPlansFilters): Promise<Paginated<PlanRow>> {
    let query = supabaseAdmin
        .from("plans")
        .select(PLAN_COLUMNS, { count: "exact" })
        .is("deleted_at", null);

    if (filters.vehicleModelId) query = query.eq("vehicle_model_id", filters.vehicleModelId);
    if (filters.active !== undefined) query = query.eq("is_active", filters.active);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawPlanRow[]).map(toPlanRow), count ?? 0, filters);
}

export async function getPlanById(id: string): Promise<PlanRow> {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .select(PLAN_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Plan not found.");
    return toPlanRow(data as unknown as RawPlanRow);
}

export async function createPlan(input: CreatePlanInput, actor: AuthContext): Promise<PlanRow> {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .insert({
            name: input.name,
            billing_period: input.billing_cycle,
            price_amount: input.price,
            duration_days: input.duration_days,
            deposit_amount: input.deposit_amount,
            vehicle_model_id: input.vehicle_model_id,
            is_active: input.active ?? true,
        })
        .select(PLAN_COLUMNS)
        .single();

    if (error) {
        if (error.code === "23505") {
            throw conflict("A plan with this name already exists.", {
                name: "This name is already in use.",
            });
        }
        throw error;
    }

    const plan = toPlanRow(data as unknown as RawPlanRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "plan.updated",
        entityType: "plan", entityId: plan.id,
        after: {
            name: plan.name,
            price: plan.price,
            duration_days: plan.duration_days,
            deposit_amount: plan.deposit_amount,
        },
    });

    return plan;
}

export async function updatePlan(
    id: string,
    patch: UpdatePlanInput,
    actor: AuthContext,
): Promise<PlanRow> {
    // The API names are not the column names, so the patch is translated
    // key by key rather than passed through. Absent keys stay absent: sending
    // `undefined` would blank the column on a PostgREST update.
    const columns: Record<string, unknown> = {};
    if (patch.name !== undefined) columns.name = patch.name;
    if (patch.billing_cycle !== undefined) columns.billing_period = patch.billing_cycle;
    if (patch.price !== undefined) columns.price_amount = patch.price;
    if (patch.duration_days !== undefined) columns.duration_days = patch.duration_days;
    if (patch.deposit_amount !== undefined) columns.deposit_amount = patch.deposit_amount;
    if (patch.active !== undefined) columns.is_active = patch.active;

    // `included_minutes` is accepted by the validator and dropped here — there
    // is no column for it. Silently ignoring it beats a 400 on a field the
    // console still sends but nobody reads.
    if (Object.keys(columns).length === 0) return getPlanById(id);

    const { data, error } = await supabaseAdmin
        .from("plans")
        .update(columns as never)
        .eq("id", id)
        .select(PLAN_COLUMNS)
        .maybeSingle();

    if (error) {
        if (error.code === "23505") {
            throw conflict("A plan with this name already exists.", {
                name: "This name is already in use.",
            });
        }
        throw error;
    }
    if (!data) throw notFound("Plan not found.");

    const plan = toPlanRow(data as unknown as RawPlanRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "plan.updated",
        entityType: "plan", entityId: plan.id, after: patch,
    });

    return plan;
}
