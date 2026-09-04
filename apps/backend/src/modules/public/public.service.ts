import { supabaseAdmin } from "../../config/supabase";
import { getFleetAvailabilitySummary } from "../vehicle-catalog/vehicle-catalog.service";

/**
 * Read models for the public marketing site (apps/website). Everything here is
 * unauthenticated and deliberately thin — only the few live figures the static
 * site needs (active plans, fleet + station counts). No PII, no per-rider data.
 */

export interface PublicPlan {
    id: string;
    name: string;
    billing_cycle: "daily" | "weekly" | "monthly" | "yearly";
    price: number;
    duration_days: number;
    deposit_amount: number;
    vehicle_model_id: string | null;
    vehicle_model_name: string | null;
}

/** Every currently-offered plan, cheapest first. */
export async function getPublicPlans(): Promise<PublicPlan[]> {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .select("id, name, billing_period, price_amount, duration_days, deposit_amount, vehicle_model_id, vehicle_models(name)")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("price_amount", { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row) => {
        const model = Array.isArray(row.vehicle_models) ? row.vehicle_models[0] : row.vehicle_models;
        return {
            id: row.id as string,
            name: row.name as string,
            billing_cycle: row.billing_period as PublicPlan["billing_cycle"],
            price: Number(row.price_amount),
            duration_days: Number(row.duration_days ?? 0),
            deposit_amount: Number(row.deposit_amount ?? 0),
            vehicle_model_id: (row.vehicle_model_id as string | null) ?? null,
            vehicle_model_name: (model as { name?: string } | null)?.name ?? null,
        };
    });
}

export interface PublicStats {
    /** Total scooters in the fleet (excludes retired). */
    scooters_total: number;
    /** Scooters ready to book right now. */
    scooters_available: number;
    /** Scooters currently out on an active rental. */
    scooters_on_road: number;
    /** Number of plans currently on offer. */
    active_plans: number;
}

/** A count query that degrades to 0 rather than throwing. */
async function safeCount(
    label: string,
    run: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
    try {
        const { count, error } = await run;
        if (error) {
            console.error(`[public.stats] ${label} failed`, error);
            return 0;
        }
        return count ?? 0;
    } catch (err) {
        console.error(`[public.stats] ${label} threw`, err);
        return 0;
    }
}

/**
 * Marketing stats. Every figure degrades to 0 on its own rather than 500ing
 * the whole endpoint — a missing view or an empty table must not blank the
 * public site.
 */
export async function getPublicStats(): Promise<PublicStats> {
    const [available, scooters_total, scooters_on_road, active_plans] = await Promise.all([
        getFleetAvailabilitySummary().catch((err) => {
            console.error("[public.stats] fleet availability failed", err);
            return { available_count: 0 };
        }),
        safeCount(
            "vehicles",
            // `vehicles` has no soft-delete column — a dead vehicle is
            // status = 'retired'.
            supabaseAdmin
                .from("vehicles")
                .select("id", { count: "exact", head: true })
                .neq("status", "retired"),
        ),
        safeCount(
            "rentals",
            supabaseAdmin.from("rentals").select("id", { count: "exact", head: true }).eq("status", "active"),
        ),
        safeCount(
            "plans",
            supabaseAdmin
                .from("plans")
                .select("id", { count: "exact", head: true })
                .eq("is_active", true)
                .is("deleted_at", null),
        ),
    ]);

    return {
        scooters_total,
        scooters_available: available.available_count,
        scooters_on_road,
        active_plans,
    };
}
