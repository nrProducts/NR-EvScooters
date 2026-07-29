/**
 * Single source of truth for post-pickup return tuning — imported by
 * rentals.service.ts and its tests. Mirrored (deliberately, with a pointer
 * comment) in apps/mobile/src/lib/returnPolicy.ts so the rider sees the
 * penalty warning before submitting; shared test fixtures guard against drift.
 *
 * NOTE ON TIMEZONE: the deadline is computed in SERVER-LOCAL time, matching
 * isValidStartDay and computeCancellationCharge. The DB stores timestamptz
 * (UTC), so on a UTC-hosted backend "end of day" lands at 05:29 IST the next
 * morning. Set TZ=Asia/Kolkata on the backend process to align both this and
 * the pre-existing booking rules with the fleet's actual timezone.
 */

/** Flat fee, in rupees, per WHOLE CALENDAR DAY past return_due_at. */
export const LATE_RETURN_FEE_PER_DAY = 100;

/**
 * Safety cap. A rider who requests a return and then vanishes would otherwise
 * accrue an unbounded figure, since nothing auto-closes an abandoned rental.
 */
export const MAX_LATE_PENALTY_DAYS = 30;

/** Reason vocabulary offered in the rider's return form. */
export const RETURN_REASONS = [
    "plan_ended",
    "switching_plan",
    "scooter_issue",
    "moving_away",
    "too_expensive",
    "other",
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];
