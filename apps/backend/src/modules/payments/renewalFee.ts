import { supabaseAdmin } from "../../config/supabase";
import { businessToday, wholeDaysBetween } from "../../common/dates";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The one place both the renewal preview (bookings.service.ts's
 * requestEarlyRecharge) and the actual charge (payments.service.ts's
 * createOrderForInvoice) compute the late-renewal fee, so they can never
 * drift from each other.
 *
 * The rate is a PER-DAY figure — the charge is that rate multiplied by how
 * many whole days have passed since the period was due, computed fresh every
 * time so it keeps growing the longer a rider waits, same as the late-return
 * fee already does.
 *
 * Two things moved underneath:
 *
 *   The global setting is `pricing_rules` code `late_fee` (`is_active` is the
 *   on/off switch, `amount` the rate), not `plan_renewal_settings`.
 *
 *   `bookings.late_fee_override` has no column in the new schema. It is a
 *   live feature (PATCH /bookings/:id/late-fee-override), so it is not
 *   dropped — it is expressed the way the new schema intends, as a
 *   `pricing_rules` row scoped to the subscription. That is what `scope` and
 *   `scope_ref_id` are for, and it gains effective dates and an audit trail
 *   the column never had.
 *
 *   The code carries the subscription id (`late_fee:<uuid>`) because
 *   `pricing_rules.code` is globally UNIQUE — a second plain `late_fee` row
 *   cannot exist. Matching is by scope and scope_ref_id, with the code prefix
 *   only to distinguish a late-fee override from any other subscription-scoped
 *   charge someone might add later.
 */
export const lateFeeOverrideCode = (subscriptionId: string): string =>
    `late_fee:${subscriptionId}`;

export async function computeLateRenewalFee(
    subscriptionId: string,
    dueDate: string,
): Promise<{ isLate: boolean; lateFee: number; daysLate: number; feePerDay: number }> {
    const today = new Date();
    const isLate = businessToday(today) > dueDate;
    if (!isLate) return { isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 };

    const daysLate = Math.max(1, wholeDaysBetween(new Date(`${dueDate}T00:00:00Z`), today));

    // A subscription-scoped late-fee rule is the successor to the old
    // per-booking override, and wins over the global rule the same way.
    const { data: override, error: overrideError } = await supabaseAdmin
        .from("pricing_rules")
        .select("amount, is_active")
        .eq("code", lateFeeOverrideCode(subscriptionId))
        .eq("is_active", true)
        .maybeSingle();
    if (overrideError) throw overrideError;

    if (override) {
        const feePerDay = Number(override.amount);
        return { isLate: true, lateFee: round2(feePerDay * daysLate), daysLate, feePerDay };
    }

    const { data: rule, error } = await supabaseAdmin
        .from("pricing_rules")
        .select("amount, is_active")
        .eq("code", "late_fee")
        .eq("scope", "global")
        .maybeSingle();
    if (error) throw error;

    if (!rule?.is_active) return { isLate: true, lateFee: 0, daysLate, feePerDay: 0 };

    const feePerDay = Number(rule.amount);
    return { isLate: true, lateFee: round2(feePerDay * daysLate), daysLate, feePerDay };
}
