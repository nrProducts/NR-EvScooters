import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { lateFeeRateFor } from "../payments/renewalFee";
import { ReturnRecoverySettingsRow, UpdateReturnRecoverySettingsInput } from "./return-recovery-settings.types";

/**
 * The day cap before a rental instead gets flagged for physical recovery —
 * `return_recovery_settings.max_late_fee_days`
 * (supabase/v2/migrations/20260824100000_return_recovery_policy.sql).
 *
 * The RATE itself is deliberately not a second column here any more.
 * `return_recovery_settings.late_fee_per_day` was added in
 * 20260825100000_return_recovery_late_fee_per_day.sql as its own
 * admin-settable number, which re-created exactly the split
 * `lateFeeRateFor`'s own doc comment (payments/renewalFee.ts) warns
 * against: "a rider whose plan has expired is simultaneously late renewing
 * and late returning ... charging them ₹450/day at the renewal screen and
 * ₹100/day at the return screen is not two policies, it is one policy with
 * two answers." `getSettings` below resolves the rate live from that same
 * global rule instead, so there is exactly one number an admin configures
 * and it's what every surface — renewal invoices, the return-lateness
 * preview, push-notification copy — shows.
 */

const COLUMNS = "id, max_late_fee_days, updated_at";

export async function getSettings(): Promise<ReturnRecoverySettingsRow> {
    const { data, error } = await supabaseAdmin
        .from("return_recovery_settings")
        .select(COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Return recovery settings not configured.");
    const lateFeePerDay = await lateFeeRateFor(null);
    return { ...data, late_fee_per_day: lateFeePerDay };
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

    const lateFeePerDay = await lateFeeRateFor(null);
    return { ...data, late_fee_per_day: lateFeePerDay };
}
