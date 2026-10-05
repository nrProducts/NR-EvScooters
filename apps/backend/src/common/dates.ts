/**
 * Dates, and the one rule that governs all of them.
 *
 * ── The business day ─────────────────────────────────────────────────────
 *
 * Every `date` column in this schema means an IST CALENDAR DAY. The database
 * says so and enforces it: `business_today()` exists precisely because
 * Supabase runs UTC, and `20260819100200_helpers.sql` calls its use
 * "mandatory in: every `date` default, every CHECK comparing a date to today,
 * every cron predicate, and every `*_on` derived from a timestamptz."
 *
 * The Edge Functions honour that — `supabase/functions/_shared/dates.ts`
 * calls the RPC. This backend did not. It computed the calendar day as
 * `new Date().toISOString().slice(0, 10)` in fourteen places, which is the
 * UTC day, and therefore returns YESTERDAY between 00:00 and 05:30 IST — five
 * and a half hours out of every twenty-four.
 *
 * What that cost, concretely:
 *
 *   · a renewal paid at 01:00 IST the day after its due date was scored ON
 *     TIME, and no late fee was charged;
 *   · the next period's `starts_on` was written as yesterday, shifting the
 *     whole subscription schedule back a day — permanently, since
 *     `base_amount_snapshot` is frozen by trigger and the row cannot simply
 *     be corrected;
 *   · settlement invoices were issued and due yesterday, i.e. born overdue;
 *   · a deposit that became refund-eligible today stayed invisible to the
 *     rider until 05:30;
 *   · a KYC document expiring today still read as valid.
 *
 * See docs/final-system-audit (finding H2).
 */

/**
 * The current business date (Asia/Kolkata) as `YYYY-MM-DD`.
 *
 * The JS counterpart of the database's `business_today()`, and it must stay
 * identical to it: `(now() at time zone 'Asia/Kolkata')::date`.
 *
 * Computed locally rather than by calling the RPC, unlike the Edge Functions'
 * `businessToday(admin)`. Three reasons: this is called on hot request paths
 * where a round trip per call is real cost; it removes a failure mode from
 * code that has no sensible fallback if the call fails; and it keeps the
 * function synchronous, which is what let it be dropped into fourteen
 * existing call sites without restructuring any of them.
 *
 * `Intl` rather than a hard-coded +05:30 offset — India has never observed
 * DST, so the two agree today, but the tz database is the thing that would
 * know if that changed, and `en-CA` formats as ISO `YYYY-MM-DD`.
 */
export function businessToday(now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

/**
 * End of an IST calendar day, as an instant.
 *
 * `${day}T23:59:59Z` looks right and is not: it is 05:29:59 IST the FOLLOWING
 * morning, which handed every rental five and a half free hours before
 * `computeLateReturnPenalty` considered it late.
 */
export function endOfBusinessDay(dateStr: string): string {
    return `${dateStr}T23:59:59+05:30`;
}

/**
 * The rental-cycle cutover: noon (12:00:00) IST on a calendar day, as an
 * instant. Every rental period in this system starts and ends at this exact
 * moment — see `calculateRentalPeriod` below, the one place that decides
 * what a plan's duration actually means in wall-clock terms.
 */
export function noonOfBusinessDay(dateStr: string): string {
    return `${dateStr}T12:00:00+05:30`;
}

export interface RentalPeriod {
    /** The instant the rental period begins — noon IST on `startDate`. */
    startAt: string;
    /** The instant the rental period ends — noon IST on `endDate`. */
    endAt: string;
    /** `YYYY-MM-DD`, the date whose noon opens the period. */
    startDate: string;
    /** `YYYY-MM-DD`, the date whose noon closes the period — `startDate + durationDays`. */
    endDate: string;
}

/**
 * THE single calculation behind every rental period in the system — bookings,
 * pickups, renewals, expiry, late fees, notifications, and every admin/rider
 * display all derive their dates from this one function. Nothing else may
 * add or subtract a day/hour offset to answer "when does this rental end."
 *
 * A plan of `durationDays` books exactly that many 24-hour days, noon to
 * noon: a 7-day plan starting noon on the 20th ends noon on the 27th —
 * `startDate + durationDays`, not `+ (durationDays - 1)`. The old inclusive-
 * day convention ("the 7th day is the last day the rider has it, ending at
 * midnight") is gone; a fixed noon anchor makes "N days" mean N literal
 * 24-hour spans, with no ambiguity left for a day-of-week convention to
 * paper over.
 *
 * `startDate` is deliberately the calendar day the rider chose or the period
 * is scheduled for — NEVER derived from "now," a payment timestamp, or an
 * actual pickup/return instant. That is the whole point of a fixed cycle:
 * whoever calls this passes in the date the cycle is anchored to, and
 * everything downstream (an early pickup, a late payment, a late return)
 * changes nothing about the two instants this returns.
 */
/**
 * A business date rendered for rider-facing copy — "20 Sep", not a raw
 * `YYYY-MM-DD`. Every rental start/end notification quotes a date this way
 * alongside the fixed "12:00 PM" (never computed — it is always noon by
 * definition), so this is the one place that formatting is decided too.
 */
export function formatBusinessDayForCopy(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00+05:30`)
        .toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * An instant's own IST clock time for rider-facing copy — "12:00 PM".
 *
 * Never hardcode "12:00 PM" or "11:59 PM" next to a due-back instant: a
 * grandfathered rental created before the fixed noon cycle shipped is still
 * legitimately due at 23:59:59 IST, and a new one is due at noon. Reading the
 * time off the actual instant is what makes both correct with no branching
 * on which regime a given rental happens to be under.
 */
export function formatTimeOfDayForCopy(instant: Date | string): string {
    const d = typeof instant === "string" ? new Date(instant) : instant;
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
    }).format(d);
}

/**
 * A precise "how late" for display — "30 minutes late", "2 days 3 hours
 * late" — from a hours-since-due figure a whole-day fee calculation already
 * computed. Never re-derives the elapsed time itself; takes the number the
 * fee math already produced so the two can never disagree.
 */
export function describeHoursLate(hoursLate: number): string {
    if (hoursLate < 1) return `${Math.round(hoursLate * 60)} minutes late`;
    const days = Math.floor(hoursLate / 24);
    const hours = Math.round(hoursLate % 24);
    if (days <= 0) return `${hours} hour${hours === 1 ? "" : "s"} late`;
    return hours > 0
        ? `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"} late`
        : `${days} day${days === 1 ? "" : "s"} late`;
}

export function calculateRentalPeriod(startDate: string, durationDays: number): RentalPeriod {
    const endDate = addDays(startDate, durationDays);
    return {
        startAt: noonOfBusinessDay(startDate),
        endAt: noonOfBusinessDay(endDate),
        startDate,
        endDate,
    };
}

/**
 * Postgres `date` arithmetic done in JS, UTC-anchored so it never drifts a
 * day under DST. Shared by the payments module (weekly-due period rollover)
 * and the plans module (maintenance-pause due-date shift) — both are doing
 * the same "add N whole days to a date-only string" operation.
 *
 * Correct as written and deliberately unchanged by the business-day fix: it
 * operates on a date STRING, never on "now", so the UTC anchor is an
 * implementation detail that cannot leak a timezone into the result.
 */
export function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Whole calendar days between two instants, DST-safe (local midnight to local midnight). */
export function wholeDaysBetween(earlier: Date, later: Date): number {
    const a = new Date(earlier); a.setHours(0, 0, 0, 0);
    const b = new Date(later); b.setHours(0, 0, 0, 0);
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * The Mini HRMS weekly off — every Sunday, fleet-wide, no per-staff or
 * per-region override. `dateStr` is a `YYYY-MM-DD` business day (typically
 * from businessToday()); parsed as UTC midnight, which is safe here
 * specifically because the string already IS the correct IST calendar day —
 * there's no further timezone conversion left to get wrong, unlike computing
 * "today" from an instant (see this file's header comment on that bug).
 */
export function isWeeklyOff(dateStr: string): boolean {
    return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 0;
}

/**
 * Every calendar day from `startDate` to `endDate`, inclusive, as
 * `YYYY-MM-DD` strings. UTC-anchored via addDays(), so it inherits the same
 * "operates on a date string, not now()" safety.
 */
export function datesBetween(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) days.push(d);
    return days;
}
