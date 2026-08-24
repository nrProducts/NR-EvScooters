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
/**
 * Underscores, not a colon, and not the raw uuid.
 *
 * `pricing_rules.code` is constrained to `^[a-z][a-z0-9_]*$`, which allows
 * neither `:` nor `-`. The previous form — `late_fee:<uuid>` — could
 * therefore NEVER be inserted: setLateFeeOverride's insert failed the check
 * constraint every time, so a per-subscription override was impossible to
 * create. The read paths matched a code that could not exist, which is why
 * nothing ever surfaced an error — the lookup simply always missed and the
 * global rate was used instead.
 *
 * Both hyphens and the separator become underscores so the result conforms.
 */
export const lateFeeOverrideCode = (subscriptionId: string): string =>
    `late_fee_${subscriptionId.replace(/-/g, '_')}`;

/**
 * The date a renewal invoice's lateness is actually measured against.
 *
 * Usually that IS the invoice's own `due_on` — the sweep's markPastDue
 * re-invoices the SAME lapsed period, so its due_on never moves. But
 * billing.service.ts's generatePeriodInvoice advances to a fresh period once
 * the current one's own invoice is already settled (see
 * resolveInvoiceablePeriod / advanceToNextPeriod), and a period created that
 * way carries its OWN forward-looking due_on (when IT will next be due) —
 * not the date the rider was actually late against. Using it directly would
 * make every late renewal price as if paid on time, because the "due" date
 * on the invoice is now in the future.
 *
 * The tell is the immediately preceding period: if it exists and is
 * `closed`, this invoice's period only exists because that one lapsed, and
 * ITS due_on is the one lateness is measured against. If the previous period
 * is still `current` (an early renewal paid ahead of schedule) or there is
 * no previous period (period 1), the invoice's own due_on is already right.
 */
export async function lateFeeReferenceDate(
    subscriptionId: string,
    subscriptionPeriodId: string | null,
    invoiceDueOn: string | null,
): Promise<string | null> {
    if (!invoiceDueOn || !subscriptionPeriodId) return invoiceDueOn;

    const { data: period, error: periodError } = await supabaseAdmin
        .from("subscription_periods")
        .select("sequence_number")
        .eq("id", subscriptionPeriodId)
        .maybeSingle();
    if (periodError) throw periodError;
    if (!period || period.sequence_number <= 1) return invoiceDueOn;

    const { data: previous, error: previousError } = await supabaseAdmin
        .from("subscription_periods")
        .select("due_on, status")
        .eq("subscription_id", subscriptionId)
        .eq("sequence_number", period.sequence_number - 1)
        .maybeSingle();
    if (previousError) throw previousError;

    return previous?.status === "closed" ? previous.due_on : invoiceDueOn;
}

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
