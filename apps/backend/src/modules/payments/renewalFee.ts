import { supabaseAdmin } from "../../config/supabase";
import { wholeDaysBetween } from "../../common/dates";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The one place both the renewal preview (bookings.service.ts's
 * requestEarlyRecharge) and the actual charge (payments.service.ts's
 * createOrderForInvoice) compute the late-renewal fee, so they can never
 * drift from each other.
 *
 * plan_renewal_settings.late_fee_amount (and any per-booking override) is a
 * PER-DAY rate — the actual charge is that rate multiplied by how many whole
 * days have passed since next_due_at, computed fresh every time so it keeps
 * growing the longer a rider waits, same as the late-return fee already does.
 *
 * A per-booking override (set by an admin) always wins over the global
 * setting; the global setting only applies at all when its own enabled flag
 * is on.
 */
export async function computeLateRenewalFee(
    bookingId: string,
    dueDate: string,
): Promise<{ isLate: boolean; lateFee: number; daysLate: number; feePerDay: number }> {
    const today = new Date();
    const isLate = today.toISOString().slice(0, 10) > dueDate;
    if (!isLate) return { isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 };

    const daysLate = Math.max(1, wholeDaysBetween(new Date(`${dueDate}T00:00:00Z`), today));

    const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("late_fee_override")
        .eq("id", bookingId)
        .maybeSingle();
    if (booking?.late_fee_override != null) {
        const feePerDay = Number(booking.late_fee_override);
        return { isLate: true, lateFee: round2(feePerDay * daysLate), daysLate, feePerDay };
    }

    const { data: settings } = await supabaseAdmin
        .from("plan_renewal_settings")
        .select("late_fee_enabled, late_fee_amount")
        .limit(1)
        .maybeSingle();
    if (!settings?.late_fee_enabled) return { isLate: true, lateFee: 0, daysLate, feePerDay: 0 };

    const feePerDay = Number(settings.late_fee_amount);
    return { isLate: true, lateFee: round2(feePerDay * daysLate), daysLate, feePerDay };
}
