/**
 * Daily activity from a tracker's GPS history — pure, so it can be tested.
 *
 * A GPS history is a list of readings (about one every 14 s while the bike is
 * moving, far sparser while it sleeps). From it, per business day (IST):
 *
 *   ignition_hours  time with the key ON ("running hours")
 *   moving_hours    time actually moving (speed above MOVING_KMPH)
 *   trips           how many times the ignition was switched on
 *
 * Each reading is credited with the time until the NEXT reading, capped at
 * GAP_CAP_MS — so a long silence (the device asleep, a coverage hole) is never
 * counted as running time. An interval is credited to the day it STARTS in.
 *
 * Distance is deliberately NOT computed here. The GPS odometer runs 5–7% below
 * the figure Intellicar reports per day (checked on a real bike over a week),
 * and two different km numbers for the same day would only confuse. Kilometres
 * come from Intellicar's own distance figure (see vehicle_distance_daily).
 */

export interface GpsReading {
    commtime: number;
    speed?: number | null;
    /** History reports 1/0; the latest-status call says "on"/"off" — both handled. */
    ignstatus?: number | string | null;
}

export interface DayActivity {
    ignition_hours: number;
    moving_hours: number;
    trips: number;
}

export const MOVING_KMPH = 2;
/** The longest a single reading is allowed to represent. */
export const GAP_CAP_MS = 2 * 60_000;

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** The IST business day (YYYY-MM-DD) an instant falls on. */
export function istDay(ms: number): string {
    return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export const ignitionOn = (r: GpsReading): boolean =>
    Number(r.ignstatus) === 1 || String(r.ignstatus ?? "").toLowerCase() === "on";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeDailyActivity(readings: GpsReading[]): Map<string, DayActivity> {
    const rows = readings
        .filter((r) => Number.isFinite(r.commtime))
        .sort((a, b) => a.commtime - b.commtime);

    const acc = new Map<string, { ign: number; mv: number; trips: number }>();
    const bucket = (day: string) => {
        let b = acc.get(day);
        if (!b) { b = { ign: 0, mv: 0, trips: 0 }; acc.set(day, b); }
        return b;
    };

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const b = bucket(istDay(r.commtime));

        const on = ignitionOn(r);
        if (on && (i === 0 || !ignitionOn(rows[i - 1]))) b.trips++;

        const next = rows[i + 1];
        if (!next) continue;
        const dt = Math.min(next.commtime - r.commtime, GAP_CAP_MS);
        if (on) b.ign += dt;
        if ((r.speed ?? 0) > MOVING_KMPH) b.mv += dt;
    }

    const out = new Map<string, DayActivity>();
    for (const [day, b] of acc) {
        out.set(day, {
            ignition_hours: round2(b.ign / 3_600_000),
            moving_hours: round2(b.mv / 3_600_000),
            trips: b.trips,
        });
    }
    return out;
}
