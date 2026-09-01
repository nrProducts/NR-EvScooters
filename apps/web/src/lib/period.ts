/**
 * Date-range presets for the Revenue screen. Every bound is an **IST calendar
 * day** (`YYYY-MM-DD`) — the same unit the backend windows on. Computed from
 * "today in Asia/Kolkata" so a user opening the page at 01:00 IST still gets
 * the right day.
 */

export type PeriodPreset =
    | "today" | "yesterday"
    | "this_week" | "last_week"
    | "this_month" | "last_month"
    | "this_year" | "last_year"
    | "custom";

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This Week",
    last_week: "Last Week",
    this_month: "This Month",
    last_month: "Last Month",
    this_year: "This Year",
    last_year: "Last Year",
    custom: "Custom Range",
};

export interface DateRange {
    from: string;
    to: string;
}

function istToday(now = new Date()): Date {
    // Shift to IST then read the calendar parts as if UTC.
    const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + n);
    return x;
}

/** Monday-start week containing `d`. */
function startOfWeek(d: Date): Date {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    return addDays(d, -dow);
}

export function rangeForPreset(preset: Exclude<PeriodPreset, "custom">, now = new Date()): DateRange {
    const today = istToday(now);
    switch (preset) {
        case "today":
            return { from: iso(today), to: iso(today) };
        case "yesterday": {
            const y = addDays(today, -1);
            return { from: iso(y), to: iso(y) };
        }
        case "this_week": {
            const s = startOfWeek(today);
            return { from: iso(s), to: iso(today) };
        }
        case "last_week": {
            const s = addDays(startOfWeek(today), -7);
            return { from: iso(s), to: iso(addDays(s, 6)) };
        }
        case "this_month": {
            const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            return { from: iso(s), to: iso(today) };
        }
        case "last_month": {
            const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
            const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
            return { from: iso(s), to: iso(e) };
        }
        case "this_year": {
            const s = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
            return { from: iso(s), to: iso(today) };
        }
        case "last_year": {
            const s = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
            const e = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31));
            return { from: iso(s), to: iso(e) };
        }
    }
}

/** Rolling "last N days" ending today (IST) — for the chart's 7D/30D/3M… quick ranges. */
export function rangeForLastDays(days: number, now = new Date()): DateRange {
    const today = istToday(now);
    return { from: iso(addDays(today, -(days - 1))), to: iso(today) };
}

/** The immediately-preceding window of equal length, for period-over-period comparison. */
export function previousRange({ from, to }: DateRange): DateRange {
    const a = new Date(`${from}T00:00:00Z`);
    const b = new Date(`${to}T00:00:00Z`);
    const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
    return { from: iso(addDays(a, -days)), to: iso(addDays(a, -1)) };
}

/** Sensible default chart granularity for a range's span. */
export function autoGranularity({ from, to }: DateRange): "daily" | "weekly" | "monthly" {
    const days = Math.round(
        (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
    ) + 1;
    if (days <= 31) return "daily";
    if (days <= 120) return "weekly";
    return "monthly";
}
