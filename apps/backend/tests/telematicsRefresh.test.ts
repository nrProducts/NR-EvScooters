import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The manual-refresh rules: a short cooldown on the live feed, and on the
 * distance feed both a cooldown and a per-day cap (Intellicar allows only 24
 * distance calls per bike per day, and the schedule already uses ~12-14).
 */
const state = {
    liveAt: null as string | null,
    distAt: null as string | null,
    liveRuns: [] as { created_at: string }[] | null,
    distRuns: [] as { created_at: string }[] | null,
};

vi.mock("../src/config/supabase", () => {
    const from = (table: string) => {
        const chain: Record<string, unknown> = {};
        const result = () => {
            if (table === "vehicle_telemetry") return { data: state.liveAt ? [{ synced_at: state.liveAt }] : [], error: null };
            if (table === "vehicle_distance_daily") return { data: state.distAt ? [{ updated_at: state.distAt }] : [], error: null };
            return { data: null, error: null };
        };
        let kind: string | null = null;
        chain.select = () => chain;
        chain.order = () => chain;
        chain.gte = () => chain;
        chain.eq = (_c: string, v: string) => { kind = v; return chain; };
        chain.limit = () => {
            if (table === "telematics_manual_runs") {
                const rows = kind === "live" ? state.liveRuns : state.distRuns;
                return Promise.resolve(rows === null ? { data: null, error: { message: "missing" } } : { data: rows, error: null });
            }
            return Promise.resolve(result());
        };
        return chain;
    };
    return { supabaseAdmin: { from } };
});

import { getTrackingStatus, DISTANCE_MANUAL_DAILY_CAP } from "../src/modules/telematics/refresh.service";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

beforeEach(() => {
    state.liveAt = minutesAgo(30);
    state.distAt = minutesAgo(30);
    state.liveRuns = [];
    state.distRuns = [];
});

describe("getTrackingStatus — live feed", () => {
    it("allows a refresh when nothing happened in the last two minutes", async () => {
        const s = await getTrackingStatus(NOW);
        expect(s.live.can_refresh).toBe(true);
        expect(s.live.every_minutes).toBe(5);
        expect(s.live.last_updated_at).toBe(minutesAgo(30));
    });

    it("blocks while data was written under 2 minutes ago (a run is likely in progress)", async () => {
        state.liveAt = minutesAgo(1);
        const s = await getTrackingStatus(NOW);
        expect(s.live.can_refresh).toBe(false);
        expect(s.live.available_at).not.toBeNull();
    });

    it("blocks right after a manual press even if the data has not moved yet", async () => {
        state.liveRuns = [{ created_at: minutesAgo(1) }];
        expect((await getTrackingStatus(NOW)).live.can_refresh).toBe(false);
    });
});

describe("getTrackingStatus — distance feed", () => {
    it("allows a manual refresh with no runs today", async () => {
        const s = await getTrackingStatus(NOW);
        expect(s.distance.can_refresh).toBe(true);
        expect(s.distance.manual_runs_today).toBe(0);
        expect(s.distance.manual_cap).toBe(DISTANCE_MANUAL_DAILY_CAP);
    });

    it("enforces a 10 minute cooldown between manual runs", async () => {
        state.distRuns = [{ created_at: minutesAgo(5) }];
        const s = await getTrackingStatus(NOW);
        expect(s.distance.can_refresh).toBe(false);
        expect(s.distance.available_at).toBe(new Date(NOW + 5 * 60_000).toISOString());
    });

    it("stops at the daily cap, whatever the cooldown", async () => {
        state.distRuns = Array.from({ length: DISTANCE_MANUAL_DAILY_CAP }, (_, i) => ({ created_at: minutesAgo(60 + i * 20) }));
        const s = await getTrackingStatus(NOW);
        expect(s.distance.can_refresh).toBe(false);
        expect(s.distance.reason).toMatch(/Daily limit/);
        expect(s.distance.manual_runs_today).toBe(DISTANCE_MANUAL_DAILY_CAP);
    });
});

describe("getTrackingStatus — before the database update", () => {
    it("disables manual refresh instead of failing when the log table does not exist", async () => {
        state.liveRuns = null;
        state.distRuns = null;
        const s = await getTrackingStatus(NOW);
        expect(s.live.can_refresh).toBe(false);
        expect(s.distance.can_refresh).toBe(false);
        expect(s.live.reason).toMatch(/not set up yet/);
    });
});
