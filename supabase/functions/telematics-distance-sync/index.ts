// =========================================================================
// telematics-distance-sync  —  pg_cron every 2 hours  →  vehicle_distance_daily
//
// Asks Intellicar for how far every scooter has gone today (and, in the first
// hours after midnight IST, yesterday — to finalise it) using the BULK
// distance call: one request for the whole fleet. READ-ONLY.
//
// Secrets: INTELLICAR_USERNAME, INTELLICAR_PASSWORD, optional
// INTELLICAR_BASE_URL — the same ones telematics-sync uses. Without them this
// does nothing and says so.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { addDays, businessToday } from "../_shared/dates.ts";

const SOURCE = "telematics-distance-sync";
const BASE = (Deno.env.get("INTELLICAR_BASE_URL") ?? "https://apiplatform.intellicar.in/api/standard").replace(/\/$/, "");
const USERNAME = Deno.env.get("INTELLICAR_USERNAME") ?? "";
const PASSWORD = Deno.env.get("INTELLICAR_PASSWORD") ?? "";

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

const norm = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();
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
        .select("id, registration_number")
        .neq("status", "retired");
    if (error) {
        console.error(`[${SOURCE}] could not read vehicles`, error);
        return json({ error: "Could not read vehicles." }, 500);
    }
    const byReg = new Map<string, string>(
        ((vehicles ?? []) as { id: string; registration_number: string }[])
            .map((v) => [norm(v.registration_number), v.id]),
    );
    const regs = ((vehicles ?? []) as { registration_number: string }[]).map((v) => v.registration_number);
    if (regs.length === 0) return json({ configured: true, vehicles: 0, rows: 0 }, 200);

    // Today always; yesterday too during the first hours after midnight IST,
    // so a day is finalised from a complete window before it stops updating.
    const istHour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()),
    );
    const days = istHour < 4 ? [addDays(today, -1), today] : [today];

    let rows = 0;
    for (const day of days) {
        const start = dayStartMs(day);
        // Today runs to "now"; a past day to the end of that day.
        const end = day === today ? Date.now() : dayStartMs(addDays(day, 1)) - 1;
        try {
            const res = await post<{ vehicleno?: string; distance?: unknown }[]>("getdistancebulk", {
                token, starttime: start, endtime: end, vehicleno: regs,
            });
            if (res.status !== "SUCCESS" || !Array.isArray(res.data)) {
                console.error(`[${SOURCE}] bulk distance for ${day} failed`, res.msg ?? res.err);
                continue;
            }
            const upserts = res.data
                .map((r) => {
                    const id = r.vehicleno ? byReg.get(norm(r.vehicleno)) : undefined;
                    const km = num(r.distance);
                    return id && km !== null && km >= 0
                        ? { vehicle_id: id, day, distance_km: Math.round(km * 100) / 100, updated_at: new Date().toISOString() }
                        : null;
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);
            if (upserts.length > 0) {
                const { error: upsertError } = await admin
                    .from("vehicle_distance_daily")
                    .upsert(upserts, { onConflict: "vehicle_id,day" });
                if (upsertError) console.error(`[${SOURCE}] could not save ${day}`, upsertError);
                else rows += upserts.length;
            }
        } catch (err) {
            console.error(`[${SOURCE}] ${day} failed`, err);
        }
    }

    return json({ configured: true, vehicles: regs.length, days, rows }, 200);
});
