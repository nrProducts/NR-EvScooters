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
