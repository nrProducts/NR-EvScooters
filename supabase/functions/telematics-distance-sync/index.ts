// =========================================================================
// telematics-distance-sync  —  pg_cron every 2 hours  →  vehicle_distance_daily
//
// Asks Intellicar how far each scooter has gone today (and, in the first hours
// after midnight IST, yesterday — to finalise it) with the PER-VEHICLE
// distance call, which reads the odometer. READ-ONLY.
//
// Why not the bulk call: tested against the real account, `getdistancebulk`
// returned 0 km for a day on which the per-vehicle call (and the odometer)
// showed 40–87 km per scooter. The per-vehicle figure is the one that matches
// the odometer, and it is the same call the per-rental distance uses, so the
// two screens agree.
//
// Limits: Intellicar allows 24 history calls per vehicle per day. This runs 12
// times a day (+ one extra "yesterday" pass after midnight) = at most 14.
// Calls are spaced 450 ms apart (≤3/s, ≥400 ms between calls).
//
// Intellicar names a scooter by its VIN / chassis number on this account (NOT
// the plate), so each scooter is matched against the account's own list by VIN
// first and plate second — see telematics-sync for the same rule.
//
// Secrets: INTELLICAR_USERNAME, INTELLICAR_PASSWORD, optional
// INTELLICAR_BASE_URL. Without them this does nothing and says so.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { addDays, businessToday } from "../_shared/dates.ts";

const SOURCE = "telematics-distance-sync";
const BASE = (Deno.env.get("INTELLICAR_BASE_URL") ?? "https://apiplatform.intellicar.in/api/standard").replace(/\/$/, "");
const USERNAME = Deno.env.get("INTELLICAR_USERNAME") ?? "";
const PASSWORD = Deno.env.get("INTELLICAR_PASSWORD") ?? "";

const GAP_MS = 450;
/** A run covers at most this many vehicles, so it finishes inside the function's time limit. */
const MAX_VEHICLES = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Envelope<T> { status?: string; data?: T; err?: unknown; msg?: string }

async function post<T>(path: string, body: Record<string, unknown>): Promise<Envelope<T>> {
    const res = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (res.status === 429) throw new Error("Rate limited by Intellicar (429).");
    if (!res.ok && res.status !== 400) throw new Error(`Intellicar ${path} returned HTTP ${res.status}.`);
    return (await res.json()) as Envelope<T>;
}

const normKey = (s: string | null) => (s ?? "").replace(/[\s-]/g, "").toUpperCase();
const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Epoch ms of 00:00 IST on a YYYY-MM-DD business day. */
const dayStartMs = (day: string) => new Date(`${day}T00:00:00+05:30`).getTime();

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    if (!USERNAME || !PASSWORD) {
        return json({ configured: false, note: "INTELLICAR_USERNAME / INTELLICAR_PASSWORD not set — nothing synced." }, 200);
    }
    const admin = adminClient();

    let today: string;
    try {
        today = await businessToday(admin);
    } catch (err) {
        console.error(`[${SOURCE}] could not read business_today()`, err);
        return json({ error: "Could not resolve the business date." }, 500);
    }

    let token: string;
    try {
        const auth = await post<{ token?: string }>("gettoken", { username: USERNAME, password: PASSWORD });
        if (auth.status !== "SUCCESS" || !auth.data?.token) return json({ error: "Intellicar login failed." }, 200);
        token = auth.data.token;
    } catch (err) {
        console.error(`[${SOURCE}] login failed`, err);
        return json({ error: "Could not reach Intellicar." }, 200);
    }

    const { data: vehicles, error } = await admin
        .from("vehicles")
        .select("id, registration_number, vin")
        .neq("status", "retired")
        .limit(MAX_VEHICLES);
    if (error) {
        console.error(`[${SOURCE}] could not read vehicles`, error);
        return json({ error: "Could not read vehicles." }, 500);
    }

    // The account's own list: exact names Intellicar uses.
    let known: Map<string, string> | null = null;
    try {
        const list = await post<{ vehicleno?: string }[]>("listvehicles", { token });
        const names = (Array.isArray(list.data) ? list.data : [])
            .map((r) => r?.vehicleno)
            .filter((x): x is string => !!x);
        if (names.length > 0) known = new Map(names.map((x) => [normKey(x), x] as const));
    } catch (err) {
        console.error(`[${SOURCE}] listvehicles failed`, err);
    }
    if (!known) return json({ configured: true, vehicles: 0, rows: 0, note: "No vehicle list from Intellicar." }, 200);
    await sleep(GAP_MS);

    // Today always; yesterday too during the first hours after midnight IST, so
    // a day is finalised from a complete window before it stops updating.
    const istHour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()),
    );
    const days = istHour < 4 ? [addDays(today, -1), today] : [today];

    let rows = 0;
    let skipped = 0;
    for (const v of (vehicles ?? []) as { id: string; registration_number: string; vin: string | null }[]) {
        const vehicleNo = known.get(normKey(v.vin)) ?? known.get(normKey(v.registration_number));
        if (!vehicleNo) { skipped++; continue; } // not on the account — telematics-sync reports it

        for (const day of days) {
            const start = dayStartMs(day);
            // Today runs to "now"; a past day to the end of that day.
            const end = day === today ? Date.now() : dayStartMs(addDays(day, 1)) - 1;
            try {
                const res = await post<{ distance?: unknown }>("getdistancetravelled", {
                    token, vehicleno: vehicleNo, starttime: start, endtime: end,
                });
                await sleep(GAP_MS);
                const km = res.status === "SUCCESS" ? num(res.data?.distance) : null;
                if (km === null || km < 0) {
                    console.error(`[${SOURCE}] no distance for ${vehicleNo} on ${day}`, res.msg ?? res.err);
                    continue;
                }
                const { error: upsertError } = await admin
                    .from("vehicle_distance_daily")
                    .upsert(
                        { vehicle_id: v.id, day, distance_km: Math.round(km * 100) / 100, updated_at: new Date().toISOString() },
                        { onConflict: "vehicle_id,day" },
                    );
                if (upsertError) console.error(`[${SOURCE}] could not save ${vehicleNo} ${day}`, upsertError);
                else rows++;
            } catch (err) {
                console.error(`[${SOURCE}] ${vehicleNo} ${day} failed`, err);
            }
        }
    }

    // ---- Fleet kilometre allowance: each bike's odometer at the period's start -----
    //
    // Usage in the period = the odometer now minus the odometer when the period
    // started. The "now" half is already refreshed every 5 minutes; the "start" half
    // is captured here, ONCE per bike per period, from the distance call's `startodo`.
    // Only bikes without one yet are fetched, so a normal run makes no extra calls.
    let baselines = 0;
    try {
        const { data: settings } = await admin
            .from("fleet_km_settings")
            .select("period_start")
            .limit(1)
            .maybeSingle();
        if (settings && settings.period_start <= today) {
            const { data: have } = await admin
                .from("fleet_km_baseline")
                .select("vehicle_id")
                .eq("period_start", settings.period_start);
            const done = new Set((have ?? []).map((r: { vehicle_id: string }) => r.vehicle_id));
            const periodStartMs = dayStartMs(settings.period_start);

            for (const v of (vehicles ?? []) as { id: string; registration_number: string; vin: string | null }[]) {
                if (done.has(v.id)) continue;
                const vehicleNo = known.get(normKey(v.vin)) ?? known.get(normKey(v.registration_number));
                if (!vehicleNo) continue;
                try {
                    const res = await post<{ startodo?: unknown }>("getdistancetravelled", {
                        token, vehicleno: vehicleNo, starttime: periodStartMs, endtime: Date.now(),
                    });
                    await sleep(GAP_MS);
                    const startOdo = res.status === "SUCCESS" ? num(res.data?.startodo) : null;
                    if (startOdo === null || startOdo < 0) continue;
                    const { error: baseError } = await admin
                        .from("fleet_km_baseline")
                        .upsert(
                            { vehicle_id: v.id, period_start: settings.period_start, start_odo: Math.round(startOdo * 10) / 10 },
                            { onConflict: "vehicle_id,period_start" },
                        );
                    if (baseError) console.error(`[${SOURCE}] could not save starting odometer for ${vehicleNo}`, baseError);
                    else baselines++;
                } catch (err) {
                    console.error(`[${SOURCE}] starting odometer for ${vehicleNo} failed`, err);
                }
            }
        }
    } catch (err) {
        // The allowance tables may not be migrated yet — never let that break the daily distance.
        console.error(`[${SOURCE}] allowance baselines skipped`, err);
    }

    return json({ configured: true, vehicles: (vehicles ?? []).length, notOnAccount: skipped, days, rows, baselines }, 200);
});
