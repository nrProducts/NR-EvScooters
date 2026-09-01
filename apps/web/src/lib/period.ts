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
    | "this_quarter"
    | "this_year" | "last_year"
    | "custom";

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This Week",
    last_week: "Last Week",
    this_month: "This Month",
    last_month: "Last Month",
    this_quarter: "This Quarter",
    this_year: "This Year",
    last_year: "Last Year",
    custom: "Custom Range",
};

/** What the selected period is measured against — shown as "vs Last Month" etc. */
export const COMPARE_LABEL: Record<PeriodPreset, string> = {
    today: "vs yesterday",
    yesterday: "vs the day before",
    this_week: "vs last week",
    last_week: "vs the week before",
    this_month: "vs last month",
    last_month: "vs the month before",
    this_quarter: "vs last quarter",
    this_year: "vs last year",
    last_year: "vs the year before",
    custom: "vs the previous period",
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
        case "this_quarter": {
            const q = Math.floor(today.getUTCMonth() / 3);
            const s = new Date(Date.UTC(today.getUTCFullYear(), q * 3, 1));
            return { from: iso(s), to: iso(today) };
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

/**
 * The comparison window for a preset. Calendar presets compare against the
 * SAME calendar unit one step back (This Month → all of last month), which is
 * what "vs Last Month" means to a finance user; a rolling/custom range falls
 * back to the equal-length window immediately before it.
 */
export function compareRangeFor(preset: PeriodPreset, range: DateRange, now = new Date()): DateRange {
    const today = istToday(now);
    switch (preset) {
        case "today":
        case "yesterday":
        case "this_week":
        case "last_week":
            return previousRange(range);
        case "this_month":
            return rangeForPreset("last_month", now);
        case "last_month": {
            const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
            const e = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 0));
            return { from: iso(s), to: iso(e) };
        }
        case "this_quarter": {
            const q = Math.floor(today.getUTCMonth() / 3);
            const s = new Date(Date.UTC(today.getUTCFullYear(), (q - 1) * 3, 1));
            const e = new Date(Date.UTC(today.getUTCFullYear(), q * 3, 0));
            return { from: iso(s), to: iso(e) };
        }
        case "this_year":
            return rangeForPreset("last_year", now);
        case "last_year": {
            const y = today.getUTCFullYear() - 2;
            return { from: `${y}-01-01`, to: `${y}-12-31` };
        }
        default:
            return previousRange(range);
    }
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
