import { supabaseAdmin } from "../../config/supabase";
import { wholeDaysBetween } from "../../common/dates";

/**
 * Rental days a rider has completed, summed across their WHOLE history.
 *
 * Cumulative on purpose: deposits hang off one subscription, but the
 * threshold that releases them is a fact about the rider. Someone who rode
 * 20 days, returned, and later booked again reaches 45 partway through the
 * second rental rather than starting from zero.
 *
 * Cancelled bookings and plans that never started contribute nothing without
 * needing to be filtered out: a `rentals` row only comes into existence at
 * handover (`picked_up_at` is NOT NULL), so a booking that was cancelled, or
 * paid for and never collected, has no row here at all. All three rental
 * statuses — active, completed, force_ended — describe real custody and
 * therefore all count.
 *
 * Day 1 is the pickup day, the same convention as planExpiryFor and
 * inclusiveDays: picked up and returned the same day is one rental day, not
 * zero. An open rental counts up to `asOf`.
 */
export async function cumulativeRentalDaysForUser(
    userId: string,
    asOf: Date = new Date(),
): Promise<number> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("picked_up_at, returned_at")
        .eq("user_id", userId);
    if (error) throw error;

    return sumRentalDays(data ?? [], asOf);
}

/** The arithmetic on its own, so it can be reasoned about without a database. */
export function sumRentalDays(
    rentals: { picked_up_at: string; returned_at: string | null }[],
    asOf: Date,
): number {
    return rentals.reduce((total, rental) => {
        const from = new Date(rental.picked_up_at);
        const to = rental.returned_at ? new Date(rental.returned_at) : asOf;
        // A rental picked up later today than `asOf` is not negative time.
        if (to < from) return total;
        return total + wholeDaysBetween(from, to) + 1;
    }, 0);
}
