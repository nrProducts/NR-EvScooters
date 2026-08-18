import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { PlanRenewalSettingsRow, UpdatePlanRenewalSettingsInput } from "./plan-renewal-settings.types";

const COLUMNS = "id, late_fee_enabled, late_fee_amount, updated_at";

function toRow(raw: { id: string; late_fee_enabled: boolean; late_fee_amount: number | string; updated_at: string | null }): PlanRenewalSettingsRow {
    return { ...raw, late_fee_amount: Number(raw.late_fee_amount) };
}

/** Singleton — exactly one row, seeded by the migration. No create/delete endpoint. */
export async function getSettings(): Promise<PlanRenewalSettingsRow> {
    const { data, error } = await supabaseAdmin.from("plan_renewal_settings").select(COLUMNS).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Plan renewal settings not configured.");
    return toRow(data);
}

export async function updateSettings(
    input: UpdatePlanRenewalSettingsInput, actor: AuthContext, req?: Request,
): Promise<PlanRenewalSettingsRow> {
    const { id } = await getSettings();
    const { data, error } = await supabaseAdmin
        .from("plan_renewal_settings")
        .update({ late_fee_enabled: input.late_fee_enabled, late_fee_amount: input.late_fee_amount })
        .eq("id", id)
        .select(COLUMNS)
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "plan_renewal_settings.updated",
        entityType: "plan_renewal_settings", entityId: id,
        after: { late_fee_enabled: input.late_fee_enabled, late_fee_amount: input.late_fee_amount },
        req,
    });

    return toRow(data);
}
