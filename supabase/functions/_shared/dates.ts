// =========================================================================
// _shared/dates — the business day, and date arithmetic on top of it
//
// Every scheduled function used to compute "today" from the Deno process
// clock, which is UTC. The business runs on Asia/Kolkata, so between 18:30
// and 00:00 IST the two disagree about what day it is — a payment due on
// the 5th looked overdue to a sweep that ran at 19:00 IST on the 4th.
//
// `business_today()` in the database is the single answer, and it is what
// every date comparison in these functions now starts from.
// =========================================================================

import type { Admin } from "./client.ts";

/** The current business date (Asia/Kolkata), as `YYYY-MM-DD`. */
export async function businessToday(admin: Admin): Promise<string> {
    const { data, error } = await admin.rpc("business_today");
    if (error) throw error;
    return data as unknown as string;
}

/** Postgres `date` arithmetic, UTC-anchored so no local zone can shift it. */
export function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`, both `YYYY-MM-DD`. Negative when b precedes a. */
export function daysBetween(a: string, b: string): number {
    const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
    return Math.round(ms / 86_400_000);
}

/**
 * The rental-cycle cutover instant: noon (12:00:00) IST on a calendar day.
 * Mirrors `noonOfBusinessDay` in apps/backend/src/common/dates.ts — the two
 * must agree, since both decide the same thing: the exact moment a period
 * with this `due_on` actually ends.
 */
export function noonInstant(dateStr: string): Date {
    return new Date(`${dateStr}T12:00:00+05:30`);
}

/**
 * Has the noon cutover for this `due_on` already happened?
 *
 * Deliberately NOT `due_on < business_today()` — that is a calendar-day
 * comparison, and under the noon-to-noon cycle a period due "today" has
 * already ended as of noon, hours before the calendar day itself rolls
 * over. Callers that only compared dates (this sweep, before this fix)
 * left every lapsed period sitting un-promoted and every late fee
 * un-charged from noon until the next day's run.
 */
export function hasPassedCutover(dueOn: string, now: Date = new Date()): boolean {
    // Strictly after, not >=: AT the cutover instant is still on time, same
    // rule as lateDaysSince (apps/backend/src/modules/payments/renewalFee.ts)
    // — "elapsedMs <= 0 is not late."
    return now.getTime() > noonInstant(dueOn).getTime();
}

/**
 * "20 Sep" — for rider-facing push copy that names a rental-cycle boundary.
 * Every rental starts and ends at noon IST (see apps/backend/src/common/dates.ts
 * calculateRentalPeriod, the single JS authority this mirrors), so copy that
 * states a boundary date should pair it with the literal "12:00 PM", not
 * re-derive a clock time from the instant.
 */
export function formatBusinessDayForCopy(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}
