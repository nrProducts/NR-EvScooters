/**
 * Fleet kilometre allowance — the arithmetic, kept pure so it can be tested.
 *
 * Usage of a bike in the period = its odometer at the END of the period (now,
 * while the period is running; the period's last day once it has closed) minus
 * its odometer at the START. The fleet's limit is the per-bike limit times the
 * number of bikes.
 */

export interface AllowanceSettings {
    period_start: string; // YYYY-MM-DD
    period_end: string;   // YYYY-MM-DD, inclusive
    km_per_vehicle: number;
}

export interface BikeInput {
    id: string;
    /** Odometer at the start of the period, or null if not captured yet. */
    baseline: number | null;
    /** Latest odometer from the live readings, or null if the bike has none. */
    current: number | null;
    /** Odometer on the period's last day (for a closed period), or null if unknown. */
    atPeriodEnd: number | null;
}

export type BikeUsageState =
    | "ok"
    | "not_started"      // the period has not begun
    | "awaiting_start"   // no starting odometer captured yet
    | "no_odometer"      // the bike has no odometer reading (not tracked)
    | "no_closing";      // the period ended and there is no reading from its last day

export interface BikeUsage {
    id: string;
    state: BikeUsageState;
    used_km: number;
    limit_km: number;
    percent_of_limit: number;
}

export interface AllowanceTotals {
    days_total: number;
    days_elapsed: number;
    days_left: number;
    period_status: "upcoming" | "running" | "ended";
    vehicle_count: number;
    fleet_limit_km: number;
    used_km: number;
    remaining_km: number;
    percent_used: number;
    /** Where the fleet lands at the end of the period at the pace so far; equals used_km once the period is over. */
    projected_km: number;
    projected_percent: number;
    /** Bikes whose usage cannot be counted yet, by reason. */
    awaiting_start: number;
    no_odometer: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function computeAllowance(
    settings: AllowanceSettings,
    today: string,
    bikes: BikeInput[],
): { totals: AllowanceTotals; bikes: BikeUsage[] } {
    const daysTotal = daysBetween(settings.period_start, settings.period_end) + 1;
    const status: AllowanceTotals["period_status"] =
        today < settings.period_start ? "upcoming" : today > settings.period_end ? "ended" : "running";
    const daysElapsed = status === "upcoming" ? 0 : status === "ended" ? daysTotal : daysBetween(settings.period_start, today) + 1;

    const limit = settings.km_per_vehicle;
    const usage: BikeUsage[] = bikes.map((b) => {
        const end = status === "ended" ? b.atPeriodEnd : b.current;
        let state: BikeUsageState = "ok";
        let used = 0;
        if (status === "upcoming") state = "not_started";
        else if (b.baseline === null) state = "awaiting_start";
        else if (end === null) state = status === "ended" ? "no_closing" : "no_odometer";
        else used = Math.max(0, end - b.baseline);
        used = round1(used);
        return { id: b.id, state, used_km: used, limit_km: limit, percent_of_limit: limit > 0 ? round1((used / limit) * 100) : 0 };
    });

    const used = round1(usage.reduce((s, u) => s + u.used_km, 0));
    const fleetLimit = round1(limit * bikes.length);
    const projected = status === "running" && daysElapsed > 0
        ? round1((used / daysElapsed) * daysTotal)
        : used;

    return {
        bikes: usage,
        totals: {
            days_total: daysTotal,
            days_elapsed: daysElapsed,
            days_left: Math.max(0, daysTotal - daysElapsed),
            period_status: status,
            vehicle_count: bikes.length,
            fleet_limit_km: fleetLimit,
            used_km: used,
            remaining_km: round1(Math.max(0, fleetLimit - used)),
            percent_used: fleetLimit > 0 ? round1((used / fleetLimit) * 100) : 0,
            projected_km: projected,
            projected_percent: fleetLimit > 0 ? round1((projected / fleetLimit) * 100) : 0,
            awaiting_start: usage.filter((u) => u.state === "awaiting_start").length,
            no_odometer: usage.filter((u) => u.state === "no_odometer" || u.state === "no_closing").length,
        },
    };
}
