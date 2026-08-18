import { supabaseAdmin } from "../../config/supabase";

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The one place both the renewal preview (bookings.service.ts's
 * requestEarlyRecharge) and the actual charge (payments.service.ts's
 * createOrderForInvoice) compute the late-renewal fee, so they can never
 * drift from each other. Replaces the old flat LATE_PAYMENT_FEE_PER_DAY —
 * this fee is a single configurable amount, not a per-day multiplier, since
 * it's triggered by missing the renewal deadline, not by an aging invoice.
 *
 * A per-booking override (set by an admin) always wins over the global
 * setting; the global setting only applies at all when its own enabled flag
 * is on.
 */
export async function computeLateRenewalFee(
    bookingId: string,
    dueDate: string,
): Promise<{ isLate: boolean; lateFee: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const isLate = today > dueDate;
    if (!isLate) return { isLate: false, lateFee: 0 };

    const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("late_fee_override")
        .eq("id", bookingId)
        .maybeSingle();
    if (booking?.late_fee_override != null) {
        return { isLate: true, lateFee: round2(Number(booking.late_fee_override)) };
    }

    const { data: settings } = await supabaseAdmin
        .from("plan_renewal_settings")
        .select("late_fee_enabled, late_fee_amount")
        .limit(1)
        .maybeSingle();
    if (!settings?.late_fee_enabled) return { isLate: true, lateFee: 0 };

    return { isLate: true, lateFee: round2(Number(settings.late_fee_amount)) };
}
