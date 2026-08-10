/**
 * Postgres `date` arithmetic done in JS, UTC-anchored so it never drifts a
 * day under DST. Shared by the payments module (weekly-due period rollover)
 * and the plans module (maintenance-pause due-date shift) — both are doing
 * the same "add N whole days to a date-only string" operation.
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
