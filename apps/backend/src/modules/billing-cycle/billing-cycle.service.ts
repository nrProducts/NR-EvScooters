import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { formatTimeOfDayForCopy } from "../../common/dates";
import { AuthContext } from "../../types";
import { notifyUser } from "../notifications/notifications.service";
import type {
    BillingCycleChangeResult, BillingCycleSettingsRow, ChangeBillingCycleInput, UpdateBillingCycleSettingsInput,
} from "./billing-cycle.types";

/**
 * Admin "Change billing cycle" — move a riding rider's payment due date
 * (later only, capped) and/or time.
 *
 * All of the rules and every write live in ONE database function,
 * `public.change_billing_cycle` (supabase/migrations/20261120100000_billing_cycle_change.sql),
 * so that:
 *   · preview and apply are the same code path — what the admin sees in the
 *     preview is exactly what gets written;
 *   · the writes (cycle time, period dates, unpaid bill due dates, the
 *     rental's return-by time, audit row) are one transaction. supabase-js
 *     has no transactions, and a half-applied re-dating leaves a rider with
 *     a billing due date and a return deadline that disagree.
 *
 * This file only resolves the booking, maps the function's rule errors to a
 * 422, and sends the rider their notification after a successful apply.
 */

const SETTINGS_COLUMNS = "id, allow_overdue_change, max_extra_days, updated_at";

/** Rule violations raised by the function carry this prefix. */
const RULE_PREFIX = "BILLING_CYCLE: ";

export async function getSettings(): Promise<BillingCycleSettingsRow> {
    const { data, error } = await supabaseAdmin
        .from("billing_cycle_settings")
        .select(SETTINGS_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Billing cycle settings not configured.");
    return data;
}

export async function updateSettings(
    input: UpdateBillingCycleSettingsInput,
    actor: AuthContext,
    req?: Request,
): Promise<BillingCycleSettingsRow> {
    const existing = await getSettings();
    const { data, error } = await supabaseAdmin
        .from("billing_cycle_settings")
        .update({ allow_overdue_change: input.allow_overdue_change, max_extra_days: input.max_extra_days })
        .eq("id", existing.id)
        .select(SETTINGS_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Billing cycle settings not configured.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "billing_cycle_settings.updated",
        entityType: "billing_cycle_setting",
        entityId: data.id,
        before: { allow_overdue_change: existing.allow_overdue_change, max_extra_days: existing.max_extra_days },
        after: { allow_overdue_change: data.allow_overdue_change, max_extra_days: data.max_extra_days },
        req,
    });

    return data;
}

async function subscriptionIdForBooking(bookingId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw businessRule("This booking has no plan yet, so there is no billing cycle to change.");
    return data.id;
}

/** Turns the function's `BILLING_CYCLE: …` exceptions into a readable 422. */
export function ruleErrorMessage(error: { message?: string } | null | undefined): string | null {
    const message = error?.message ?? "";
    const at = message.indexOf(RULE_PREFIX);
    return at === -1 ? null : message.slice(at + RULE_PREFIX.length).trim();
}

async function runChange(
    bookingId: string,
    input: ChangeBillingCycleInput,
    actorId: string | null,
    apply: boolean,
): Promise<BillingCycleChangeResult> {
    const subscriptionId = await subscriptionIdForBooking(bookingId);
    const { data, error } = await supabaseAdmin.rpc("change_billing_cycle", {
        p_subscription_id: subscriptionId,
        p_new_due_on: input.new_due_on,
        p_new_cycle_time: `${input.new_due_time}:00`,
        p_reason: input.reason ?? null,
        p_actor_id: actorId,
        p_apply: apply,
    });
    if (error) {
        const rule = ruleErrorMessage(error);
        if (rule) throw businessRule(rule);
        throw error;
    }
    return data as unknown as BillingCycleChangeResult;
}

/** What the change would do. Writes nothing. */
export function previewChange(bookingId: string, input: ChangeBillingCycleInput): Promise<BillingCycleChangeResult> {
    return runChange(bookingId, input, null, false);
}

/** Rider-facing copy for the new due moment — "15 Nov 2026 at 8:00 PM". */
export function describeDueForRider(dueAt: string): string {
    const date = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    }).format(new Date(dueAt));
    return `${date} at ${formatTimeOfDayForCopy(dueAt)}`;
}

export async function applyChange(
    bookingId: string,
    input: ChangeBillingCycleInput,
    actor: AuthContext,
): Promise<BillingCycleChangeResult> {
    const result = await runChange(bookingId, input, actor.id, true);

    // notifyUser never throws — a failed notification must not report the
    // (already committed) change as failed.
    await notifyUser(result.user_id, {
        template: "plan_cycle_changed",
        title: "Payment time updated",
        body: `Your plan payment is now due on ${describeDueForRider(result.new_due_at)}. `
            + "Your scooter's return-by time moves with it.",
        screen: "billing",
        reference_type: "subscription",
        reference_id: result.subscription_id,
        booking_id: bookingId,
    });

    return result;
}
