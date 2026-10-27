import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/env";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, serviceUnavailable } from "../../common/AppError";
import { businessToday } from "../../common/dates";

/**
 * Tracking refresh status, and the manual "Refresh now".
 *
 * Two feeds with very different budgets:
 *   live      position, battery, odometer, last seen — every 5 min on a schedule.
 *             Intellicar's "latest" calls allow 720/bike/day and the schedule
 *             uses 288, so a manual refresh is cheap: only a short cooldown.
 *   distance  Today / 7 days / 30 days km — every 2 h on a schedule. This uses
 *             Intellicar's "history" calls, limited to 24/bike/day, of which the
 *             schedule uses ~12-14. So manual runs are CAPPED per business day,
 *             with a cooldown between them.
 *
 * A manual refresh just invokes the same Edge Function the schedule does; the
 * function is fire-and-forget from here (it takes up to a minute), and the
 * screen watches "last updated" move.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

export type RefreshKind = "live" | "distance";

export const LIVE_COOLDOWN_MS = 2 * 60_000;
export const DISTANCE_COOLDOWN_MS = 10 * 60_000;
export const DISTANCE_MANUAL_DAILY_CAP = 6;

const FUNCTION_FOR: Record<RefreshKind, string> = {
    live: "telematics-sync",
    distance: "telematics-distance-sync",
};

interface FeedStatus {
    /** Latest time the feed's data was written, or null if never. */
    last_updated_at: string | null;
    can_refresh: boolean;
    /** When a refresh will be allowed again, if it is not now. */
    available_at: string | null;
    reason: string | null;
}

export interface TrackingStatus {
    live: FeedStatus & { every_minutes: number };
    distance: FeedStatus & { every_hours: number; manual_runs_today: number; manual_cap: number };
}

async function latest(table: string, column: string): Promise<string | null> {
    const { data, error } = await db.from(table).select(column).order(column, { ascending: false }).limit(1);
    if (error) {
        console.warn(`[telematics] ${table}.${column} unreadable`, error.message);
        return null;
    }
    const row = (data ?? [])[0] as unknown as Record<string, string> | undefined;
    return row?.[column] ?? null;
}

/** Manual runs of one kind, newest first, since `sinceIso` (all of them when omitted). */
async function manualRuns(kind: RefreshKind, sinceIso?: string): Promise<{ created_at: string }[] | null> {
    let q = db.from("telematics_manual_runs").select("created_at").eq("kind", kind).order("created_at", { ascending: false });
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const { data, error } = await q.limit(50);
    if (error) {
        console.warn("[telematics] telematics_manual_runs unreadable", error.message);
        return null; // table not migrated yet
    }
    return (data ?? []) as { created_at: string }[];
}

const ist = (ms: number) => new Date(ms).toISOString();

export async function getTrackingStatus(now: number = Date.now()): Promise<TrackingStatus> {
    const dayStart = new Date(`${businessToday(new Date(now))}T00:00:00+05:30`).toISOString();

    const [liveAt, distAt, liveRuns, distRunsToday] = await Promise.all([
        latest("vehicle_telemetry", "synced_at"),
        latest("vehicle_distance_daily", "updated_at"),
        manualRuns("live"),
        manualRuns("distance", dayStart),
    ]);

    // ---- live ---------------------------------------------------------
    let live: FeedStatus = { last_updated_at: liveAt, can_refresh: true, available_at: null, reason: null };
    if (liveRuns === null) {
        live = { ...live, can_refresh: false, reason: "Manual refresh is not set up yet (database update pending)." };
    } else {
        // Cooldown from the latest manual press OR the latest data write: a run
        // already in progress (or a scheduled one just done) makes another pointless.
        const lastTouch = Math.max(
            liveRuns[0] ? new Date(liveRuns[0].created_at).getTime() : 0,
            liveAt ? new Date(liveAt).getTime() : 0,
        );
        if (lastTouch && now - lastTouch < LIVE_COOLDOWN_MS) {
            live = {
                ...live, can_refresh: false, available_at: ist(lastTouch + LIVE_COOLDOWN_MS),
                reason: "Just updated — try again in a minute or two.",
            };
        }
    }

    // ---- distance -----------------------------------------------------
    let distance: FeedStatus = { last_updated_at: distAt, can_refresh: true, available_at: null, reason: null };
    const used = distRunsToday?.length ?? 0;
    if (distRunsToday === null) {
        distance = { ...distance, can_refresh: false, reason: "Manual refresh is not set up yet (database update pending)." };
    } else if (used >= DISTANCE_MANUAL_DAILY_CAP) {
        distance = {
            ...distance, can_refresh: false,
            reason: `Daily limit of ${DISTANCE_MANUAL_DAILY_CAP} manual refreshes reached — Intellicar allows only 24 distance calls per bike per day. It also refreshes itself every 2 hours.`,
        };
    } else if (distRunsToday[0] && now - new Date(distRunsToday[0].created_at).getTime() < DISTANCE_COOLDOWN_MS) {
        const at = new Date(distRunsToday[0].created_at).getTime() + DISTANCE_COOLDOWN_MS;
        distance = { ...distance, can_refresh: false, available_at: ist(at), reason: "A refresh was just started — wait a few minutes." };
    }

    return {
        live: { ...live, every_minutes: 5 },
        distance: { ...distance, every_hours: 2, manual_runs_today: used, manual_cap: DISTANCE_MANUAL_DAILY_CAP },
    };
}

/** Starts a refresh now. Throws a business-rule error if it is not allowed right now. */
export async function triggerRefresh(kind: RefreshKind, actorId: string): Promise<{ started_at: string }> {
    const status = await getTrackingStatus();
    const feed = status[kind];
    if (!feed.can_refresh) throw businessRule(feed.reason ?? "A refresh is not allowed right now.");

    const startedAt = new Date().toISOString();
    const { error } = await db.from("telematics_manual_runs").insert({ kind, triggered_by: actorId });
    if (error) throw serviceUnavailable("Could not record the refresh request.");

    // Fire and forget: the function takes up to a minute. Its outcome shows up
    // as "last updated" moving, which is what the screen watches.
    startEdgeFunction(FUNCTION_FOR[kind]);

    return { started_at: startedAt };
}

/**
 * Starts one of the tracking Edge Functions in the background (it takes up to a
 * minute, so nothing waits for it). Used by the manual "Refresh now" and by the
 * fleet allowance when an admin changes the period, so the new period's
 * starting odometers get captured straight away.
 */
export function startEdgeFunction(name: string): void {
    void fetch(`${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.supabaseServiceKey}`,
            apikey: env.supabaseServiceKey,
        },
        body: "{}",
    })
        .then((res) => { if (!res.ok) console.warn(`[telematics] ${name} returned HTTP ${res.status}`); })
        .catch((err) => console.warn(`[telematics] ${name} failed`, err instanceof Error ? err.message : err));
}
