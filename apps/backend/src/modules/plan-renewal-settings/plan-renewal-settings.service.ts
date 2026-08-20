import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { PlanRenewalSettingsRow, UpdatePlanRenewalSettingsInput } from "./plan-renewal-settings.types";

/**
 * The late fee.
 *
 * `plan_renewal_settings` is gone. It was a singleton table with two
 * meaningful columns and a module of its own, and the thing it described was
 * a pricing rule — so it is one now, `pricing_rules` with code `late_fee`.
 *
 * That is a real gain rather than tidying: as a dedicated table the fee could
 * not be scoped to a plan, could not be dated, could not be versioned, and
 * could not show up in `subscription_adjustments` next to every other charge,
 * so an overdue rider's late fee was invisible to the same reporting that
 * showed their transaction fee.
 *
 * The endpoints keep their shape. The admin console edits an amount and a
 * toggle, and that is still exactly what it gets — `is_active` is the toggle,
 * `amount` is the amount. When the console grows a real pricing-rules screen
 * (Stage 5's territory), this module becomes redundant and can go.
 */

const LATE_FEE_CODE = "late_fee";

const COLUMNS = "id, is_active, amount, updated_at";

function toRow(raw: {
    id: string;
    is_active: boolean;
    amount: number | string;
    updated_at: string | null;
}): PlanRenewalSettingsRow {
    return {
        id: raw.id,
        late_fee_enabled: raw.is_active,
        late_fee_amount: Number(raw.amount),
        updated_at: raw.updated_at,
    };
}

/** Still a singleton from the caller's point of view — one rule, by code. */
export async function getSettings(): Promise<PlanRenewalSettingsRow> {
    const { data, error } = await supabaseAdmin
        .from("pricing_rules")
        .select(COLUMNS)
        .eq("code", LATE_FEE_CODE)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Plan renewal settings not configured.");
    return toRow(data);
}

export async function updateSettings(
    input: UpdatePlanRenewalSettingsInput,
    actor: AuthContext,
    req?: Request,
): Promise<PlanRenewalSettingsRow> {
    const { data, error } = await supabaseAdmin
        .from("pricing_rules")
        .update({ is_active: input.late_fee_enabled, amount: input.late_fee_amount })
        .eq("code", LATE_FEE_CODE)
        .select(COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Plan renewal settings not configured.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "plan_renewal_settings.updated",
        entityType: "pricing_rule",
        entityId: data.id,
        after: { late_fee_enabled: input.late_fee_enabled, late_fee_amount: input.late_fee_amount },
        req,
    });

    return toRow(data);
}
