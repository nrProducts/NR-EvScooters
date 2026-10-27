// =========================================================================
// telematics-sync  —  pg_cron every 5 minutes  →  public.vehicle_telemetry
//
// Pulls the latest GPS and battery (CAN) reading for every live scooter from
// Intellicar and overwrites that scooter's row. READ-ONLY toward Intellicar:
// nothing here can lock, immobilise or otherwise command a vehicle.
//
// Secrets (supabase secrets set …):
//   INTELLICAR_USERNAME, INTELLICAR_PASSWORD   — the platform login
//   INTELLICAR_BASE_URL                        — optional, defaults below
// Without the first two this function does nothing and says so; it never
// fails the cron job.
//
// Rate limits (Intellicar): ≤3 calls/second with ≥400 ms between calls, and
// 720 "latest" calls per vehicle per day. Two calls per vehicle every 5
// minutes is 576/day, inside the allowance; calls are spaced 450 ms apart.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { notifyStaff } from "../_shared/notifyStaff.ts";

const SOURCE = "telematics-sync";
const BASE = (Deno.env.get("INTELLICAR_BASE_URL") ?? "https://apiplatform.intellicar.in/api/standard").replace(/\/$/, "");
const USERNAME = Deno.env.get("INTELLICAR_USERNAME") ?? "";
const PASSWORD = Deno.env.get("INTELLICAR_PASSWORD") ?? "";

const GAP_MS = 450;

// Alert thresholds. An alert fires when a scooter CROSSES one of these between
// two syncs — never on every sync while it stays on the wrong side.
const LOW_BATTERY_PERCENT = 15;
const OFFLINE_MS = 6 * 3_600_000;
const MOVING_KMPH = 5;
/** A run covers at most this many vehicles, so it always finishes inside the function's time limit. */
const MAX_VEHICLES = 80;

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

const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const epochToIso = (v: unknown): string | null => {
    const n = num(v);
    return n && n > 0 ? new Date(n).toISOString() : null;
};
const truthy = (v: unknown): boolean | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return ["1", "true", "on", "yes"].includes(v.toLowerCase());
    return Boolean(v);
};

interface GpsData {
    commtime?: number; lat?: number; lng?: number; speed?: number; heading?: number;
    ignstatus?: unknown; mobili?: unknown; devbattery?: number; vehbattery?: number;
}
type CanValue = { value?: number; timestamp?: number } | undefined;
interface CanData { soc?: CanValue; battery_temp?: CanValue; battery_voltage?: CanValue; current?: CanValue }

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    if (!USERNAME || !PASSWORD) {
        return json({ configured: false, note: "INTELLICAR_USERNAME / INTELLICAR_PASSWORD not set — nothing synced." }, 200);
    }
    const admin = adminClient();

    let token: string;
    try {
        const auth = await post<{ token?: string }>("gettoken", { username: USERNAME, password: PASSWORD });
        if (auth.status !== "SUCCESS" || !auth.data?.token) {
            console.error(`[${SOURCE}] login rejected`, auth.msg ?? auth.err);
            return json({ error: "Intellicar login failed." }, 200);
        }
        token = auth.data.token;
    } catch (err) {
        console.error(`[${SOURCE}] login failed`, err);
        return json({ error: "Could not reach Intellicar." }, 200);
    }

    // Vehicles that are on the road or could be: everything except retired.
    const { data: vehicles, error } = await admin
        .from("vehicles")
        .select("id, registration_number, status, display_name")
        .neq("status", "retired")
        .limit(MAX_VEHICLES);
    if (error) {
        console.error(`[${SOURCE}] could not read vehicles`, error);
        return json({ error: "Could not read vehicles." }, 500);
    }

    // Which of our scooters Intellicar actually knows about — a scooter that
    // isn't on the account is recorded as such rather than burning two calls
    // on a guaranteed failure every 5 minutes.
    let known: Set<string> | null = null;
    try {
        const list = await post<unknown>("listvehicles", { token });
        const rows = Array.isArray(list.data) ? list.data : [];
        const names = rows
            .map((r) => (typeof r === "string" ? r : (r as { vehicleno?: string })?.vehicleno))
            .filter((x): x is string => !!x)
            .map((x) => x.replace(/[\s-]/g, "").toUpperCase());
        if (names.length > 0) known = new Set(names);
    } catch (err) {
        console.error(`[${SOURCE}] listvehicles failed — syncing every vehicle`, err);
    }
    await sleep(GAP_MS);

    // What each scooter looked like at the PREVIOUS sync, so we can tell a
    // change from a steady state.
    const { data: previousRows } = await admin
        .from("vehicle_telemetry")
        .select("vehicle_id, soc_percent, gps_at, speed_kmph, ignition_on, synced_at");
    const previous = new Map<string, NonNullable<Prev>>(
        (previousRows ?? []).map((r: NonNullable<Prev> & { vehicle_id: string }) => [r.vehicle_id, r]),
    );

    let ok = 0;
    let failed = 0;
    let unknown = 0;
    let alerts = 0;

    for (const v of (vehicles ?? []) as { id: string; registration_number: string; status: string; display_name: string | null }[]) {
        const row: Record<string, unknown> = {
            vehicle_id: v.id,
            registration_number: v.registration_number,
            synced_at: new Date().toISOString(),
            sync_error: null,
        };

        const normalised = v.registration_number.replace(/[\s-]/g, "").toUpperCase();
        if (known && !known.has(normalised)) {
            row.sync_error = "Not found on the Intellicar account.";
            unknown++;
        } else {
            try {
                const gps = await post<GpsData>("getlastgpsstatus", { token, vehicleno: v.registration_number });
                await sleep(GAP_MS);
                if (gps.status === "SUCCESS" && gps.data) {
                    const g = gps.data;
                    Object.assign(row, {
                        lat: num(g.lat), lng: num(g.lng),
                        speed_kmph: num(g.speed), heading_deg: num(g.heading),
                        ignition_on: truthy(g.ignstatus),
                        // mobili: 0 = mobilised, 1 = immobilised
                        immobilised: g.mobili === undefined || g.mobili === null ? null : num(g.mobili) === 1,
                        device_battery_v: num(g.devbattery), vehicle_battery_v: num(g.vehbattery),
                        gps_at: epochToIso(g.commtime),
                    });
                } else {
                    row.sync_error = `GPS: ${gps.msg ?? "no data"}`;
                }

                const can = await post<CanData>("getlatestcan", { token, vehicleno: v.registration_number });
                await sleep(GAP_MS);
                if (can.status === "SUCCESS" && can.data) {
                    const c = can.data;
                    Object.assign(row, {
                        soc_percent: num(c.soc?.value),
                        battery_temp_c: num(c.battery_temp?.value),
                        battery_voltage: num(c.battery_voltage?.value),
                        battery_current_a: num(c.current?.value),
                        can_at: epochToIso(c.soc?.timestamp ?? c.battery_voltage?.timestamp),
                    });
                }
                // A scooter with no CAN feed is normal, not an error.
                if (row.sync_error) failed++; else ok++;
            } catch (err) {
                row.sync_error = err instanceof Error ? err.message : String(err);
                failed++;
                console.error(`[${SOURCE}] ${v.registration_number} failed`, err);
            }
        }

        const { error: upsertError } = await admin.from("vehicle_telemetry").upsert(row, { onConflict: "vehicle_id" });
        if (upsertError) {
            console.error(`[${SOURCE}] could not save ${v.registration_number}`, upsertError);
            continue; // not saved — do not alert on, or re-alert for, a state we did not record
        }

        alerts += await raiseAlerts(admin, v, previous.get(v.id), row);
    }

    return json({ configured: true, vehicles: (vehicles ?? []).length, ok, failed, notOnAccount: unknown, alerts }, 200);
});

type Prev = {
    soc_percent: number | null; gps_at: string | null; speed_kmph: number | null;
    ignition_on: boolean | null; synced_at: string;
} | undefined;

/**
 * Compares this sync with the last one and alerts staff on a CHANGE:
 *   low battery   — charge crossed below 15%
 *   offline       — a scooter that was reporting has been silent for > 6 h
 *   movement      — a scooter nobody holds started moving with ignition on
 * A scooter that is simply still low / still offline / still moving stays
 * quiet; it alerts again only after it has recovered and crossed again.
 * A scooter with no previous reading (first ever sync) raises nothing —
 * there is no "before" to have changed from.
 */
async function raiseAlerts(
    admin: ReturnType<typeof adminClient>,
    v: { id: string; registration_number: string; status: string; display_name: string | null },
    prev: Prev,
    row: Record<string, unknown>,
): Promise<number> {
    if (!prev) return 0;
    const label = `${v.display_name ?? "Scooter"} (${v.registration_number})`;
    let raised = 0;
    const alert = async (typeCode: string, title: string, body: string) => {
        const r = await notifyStaff(admin, {
            typeCode, subjectType: "vehicle", subjectId: v.id, title, body,
            screen: "/live-map", payload: { vehicle_id: v.id },
        });
        if (r.notified > 0) raised++;
    };

    const soc = row.soc_percent as number | null | undefined;
    if (typeof soc === "number" && soc < LOW_BATTERY_PERCENT && (prev.soc_percent === null || prev.soc_percent >= LOW_BATTERY_PERCENT)) {
        await alert("vehicle_low_battery", "Scooter battery low", `${label} is at ${Math.round(soc)}%.`);
    }

    const gpsAt = (row.gps_at as string | null | undefined) ?? prev.gps_at;
    // "Was reporting" is judged AT THE PREVIOUS SYNC: a silent scooter keeps the
    // same gps_at forever, so measuring it against now would make "was
    // reporting" and "is offline" impossible to be true together.
    const wasReporting = !!prev.gps_at && new Date(prev.synced_at).getTime() - new Date(prev.gps_at).getTime() <= OFFLINE_MS;
    const nowOffline = !gpsAt || Date.now() - new Date(gpsAt).getTime() > OFFLINE_MS;
    if (wasReporting && nowOffline) {
        await alert("vehicle_offline", "Scooter offline", `${label} has not reported for over 6 hours.`);
    }

    const speed = row.speed_kmph as number | null | undefined;
    const wasMoving = (prev.speed_kmph ?? 0) >= MOVING_KMPH && prev.ignition_on === true;
    const nowMoving = typeof speed === "number" && speed >= MOVING_KMPH && row.ignition_on === true;
    // Only a scooter nobody holds: `available` or `reserved`. One with a rider
    // (`assigned`) or in the workshop (`maintenance`) is expected to move.
    if (nowMoving && !wasMoving && (v.status === "available" || v.status === "reserved")) {
        await alert("vehicle_unexpected_movement", "Scooter moving without a rider", `${label} is moving at ${Math.round(speed as number)} km/h and is not assigned to any rider.`);
    }
    return raised;
}
