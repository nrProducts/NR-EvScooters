import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { ReturnRecoverySettingsRow, UpdateReturnRecoverySettingsInput } from "./return-recovery-settings.types";

/**
 * The return late-fee day cap — "how many days past the due date does a late
 * fee accrue for before the rental instead gets flagged for physical
 * recovery." Singleton table, `return_recovery_settings`
 * (supabase/v2/migrations/20260824100000_return_recovery_policy.sql).
 *
 * Distinct from plan-renewal-settings (`pricing_rules` code `late_fee`),
 * which is the RENEWAL/payment late fee — a subscription payment running
 * late. This one is the RETURN/physical-custody late fee — the scooter
 * itself running late. The two are unrelated concepts that happen to share
 * the word "late fee"; this module and that one intentionally do not touch
 * the same table.
 */

const COLUMNS = "id, max_late_fee_days, updated_at";

export async function getSettings(): Promise<ReturnRecoverySettingsRow> {
    const { data, error } = await supabaseAdmin
        .from("return_recovery_settings")
        .select(COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Return recovery settings not configured.");
    return data;
}

export async function updateSettings(
    input: UpdateReturnRecoverySettingsInput,
    actor: AuthContext,
    req?: Request,
): Promise<ReturnRecoverySettingsRow> {
    // Singleton table, but the UPDATE still needs an explicit WHERE — an
    // unqualified UPDATE errors ("UPDATE requires a WHERE clause") rather
    // than silently touching every row, so the row's own id is fetched
    // first and the update is scoped to it.
    const existing = await getSettings();
    const { data, error } = await supabaseAdmin
        .from("return_recovery_settings")
        .update({ max_late_fee_days: input.max_late_fee_days })
        .eq("id", existing.id)
        .select(COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Return recovery settings not configured.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "return_recovery_settings.updated",
        entityType: "return_recovery_setting",
        entityId: data.id,
        after: { max_late_fee_days: input.max_late_fee_days },
        req,
    });

    return data;
}
