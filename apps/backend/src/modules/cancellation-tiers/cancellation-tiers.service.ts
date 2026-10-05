import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { DEFAULT_CANCELLATION_TIERS, type CancellationTier } from "../bookings/cancellation.constants";
import {
    CancellationTierRow, ReplaceCancellationTiersInput,
} from "./cancellation-tiers.types";

/**
 * The pre-pickup cancellation policy — a list of time slabs
 * (`cancellation_tiers`). See computeCancellationCharge in bookings.service.ts
 * for how a slab is picked. `DEFAULT_CANCELLATION_TIERS` is the fallback when
 * the table is empty.
 */

const COLUMNS = "id, upto_minutes, penalty_percent, updated_at";

export async function listTiers(): Promise<CancellationTierRow[]> {
    const { data, error } = await supabaseAdmin
        .from("cancellation_tiers")
        .select(COLUMNS)
        .order("upto_minutes", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
        ...r,
        upto_minutes: Number(r.upto_minutes),
        penalty_percent: Number(r.penalty_percent),
    }));
}

/** Tier list for cancellation math — the table, or the compile-time fallback. Never throws. */
export async function getCancellationTiers(): Promise<CancellationTier[]> {
    try {
        const rows = await listTiers();
        if (rows.length === 0) return [...DEFAULT_CANCELLATION_TIERS];
        return rows.map((r) => ({ upto_minutes: r.upto_minutes, penalty_percent: r.penalty_percent }));
    } catch {
        return [...DEFAULT_CANCELLATION_TIERS];
    }
}

/**
 * Replaces the whole policy in one shot — the admin edits a list and saves.
 * Duplicate `upto_minutes` are rejected; an empty list is allowed (means "no
 * cancellation penalty, ever").
 */
export async function replaceTiers(
    input: ReplaceCancellationTiersInput,
    actor: AuthContext,
    req?: Request,
): Promise<CancellationTierRow[]> {
    const tiers = input.tiers
        .map((t) => ({ upto_minutes: Math.round(t.upto_minutes), penalty_percent: t.penalty_percent }))
        .sort((a, b) => a.upto_minutes - b.upto_minutes);

    for (const t of tiers) {
        if (t.upto_minutes <= 0) throw businessRule("Each tier's minutes must be greater than zero.");
        if (t.penalty_percent < 0 || t.penalty_percent > 100) {
            throw businessRule("Each tier's penalty percent must be between 0 and 100.");
        }
    }
    const distinct = new Set(tiers.map((t) => t.upto_minutes));
    if (distinct.size !== tiers.length) throw businessRule("Two tiers can't share the same minutes value.");

    const { error: delError } = await supabaseAdmin
        .from("cancellation_tiers")
        .delete()
        .gte("upto_minutes", 0);
    if (delError) throw delError;

    if (tiers.length > 0) {
        const { error: insError } = await supabaseAdmin.from("cancellation_tiers").insert(tiers);
        if (insError) throw insError;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "cancellation_tiers.updated",
        entityType: "cancellation_tier",
        entityId: "cancellation_tiers",
        after: { tiers },
        req,
    });

    return listTiers();
}
