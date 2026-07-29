/**
 * Single source of truth for pre-pickup cancellation tuning — imported by
 * bookings.service.ts and its tests. Mirrored (deliberately, with a pointer
 * comment) in apps/mobile/src/lib/cancellationPolicy.ts so the rider can be
 * shown the fee before confirming; shared test fixtures guard against drift.
 */

/**
 * bookings.start_day is a DATE with no time, so pickup is treated as 00:00 on
 * that day and "more than 24h notice" has to be expressed in whole days:
 * free when start_day is this many calendar days out or more. 2 guarantees at
 * least a full day of real notice no matter what hour pickup happens.
 */
export const FREE_CANCELLATION_NOTICE_DAYS = 2;

/** Share of the net plan price kept back when cancelling inside the free window. */
export const LATE_CANCELLATION_PENALTY_RATE = 0.25;

/**
 * Grace period from booking creation during which cancelling is always free,
 * however close pickup is. Without this a booking made FOR tomorrow is born
 * inside the notice window and would be charged seconds after it was created —
 * the notice rule alone only asks how close pickup is, never how recently the
 * rider booked.
 */
export const FREE_CANCELLATION_GRACE_MINUTES = 60;
