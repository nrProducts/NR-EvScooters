import { describe, expect, it } from "vitest";
import { computeAllowance, daysBetween, type AllowanceSettings, type BikeInput } from "../src/modules/fleet-allowance/allowance.calc";

const settings: AllowanceSettings = { period_start: "2026-10-05", period_end: "2026-11-04", km_per_vehicle: 2120 };

const bike = (id: string, baseline: number | null, current: number | null, atPeriodEnd: number | null = null): BikeInput =>
    ({ id, baseline, current, atPeriodEnd });

describe("daysBetween", () => {
    it("counts whole days, including across a month end", () => {
        expect(daysBetween("2026-10-05", "2026-11-04")).toBe(30);
        expect(daysBetween("2026-10-05", "2026-10-05")).toBe(0);
    });
});

describe("computeAllowance — a running period", () => {
    it("sums odometer-minus-baseline and sets the fleet limit to per-bike × bike count", () => {
        const { totals, bikes } = computeAllowance(settings, "2026-10-20", [
            bike("a", 1000, 1500), // 500
            bike("b", 200, 700.5), // 500.5
            bike("c", 0, 0),       // 0
        ]);
        expect(bikes.map((b) => b.used_km)).toEqual([500, 500.5, 0]);
        expect(totals.used_km).toBe(1000.5);
        expect(totals.vehicle_count).toBe(3);
        expect(totals.fleet_limit_km).toBe(6360); // 2120 × 3
        expect(totals.remaining_km).toBe(5359.5);
        expect(totals.percent_used).toBeCloseTo(15.7, 1);
    });

    it("counts days: 5 Oct..4 Nov is 31 days; on 20 Oct it is day 16 with 15 left", () => {
        const { totals } = computeAllowance(settings, "2026-10-20", [bike("a", 0, 0)]);
        expect(totals.days_total).toBe(31);
        expect(totals.days_elapsed).toBe(16);
        expect(totals.days_left).toBe(15);
        expect(totals.period_status).toBe("running");
    });

    it("projects the end-of-period total at the pace so far", () => {
        // 16 of 31 days elapsed, 800 km used -> 50 km/day -> 1550 projected
        const { totals } = computeAllowance(settings, "2026-10-20", [bike("a", 0, 800)]);
        expect(totals.projected_km).toBe(1550);
    });

    it("flags a bike whose starting odometer is not captured yet, and counts it as 0", () => {
        const { totals, bikes } = computeAllowance(settings, "2026-10-20", [bike("a", null, 900), bike("b", 0, 100)]);
        expect(bikes[0].state).toBe("awaiting_start");
        expect(bikes[0].used_km).toBe(0);
        expect(totals.used_km).toBe(100);
        expect(totals.awaiting_start).toBe(1);
    });

    it("flags a bike with no odometer reading", () => {
        const { totals, bikes } = computeAllowance(settings, "2026-10-20", [bike("a", 100, null)]);
        expect(bikes[0].state).toBe("no_odometer");
        expect(totals.no_odometer).toBe(1);
    });

    it("never reports negative usage (e.g. an odometer reset)", () => {
        const { bikes } = computeAllowance(settings, "2026-10-20", [bike("a", 5000, 10)]);
        expect(bikes[0].used_km).toBe(0);
    });

    it("can exceed 100% — the limit is a limit, not a cap on the figure", () => {
        const { totals, bikes } = computeAllowance(settings, "2026-10-20", [bike("a", 0, 2500)]);
        expect(bikes[0].percent_of_limit).toBeGreaterThan(100);
        expect(totals.percent_used).toBeGreaterThan(100);
        expect(totals.remaining_km).toBe(0);
    });
});

describe("computeAllowance — before and after the period", () => {
    it("shows nothing used before the period starts", () => {
        const { totals, bikes } = computeAllowance(settings, "2026-10-01", [bike("a", 100, 400)]);
        expect(totals.period_status).toBe("upcoming");
        expect(bikes[0].state).toBe("not_started");
        expect(totals.used_km).toBe(0);
        expect(totals.days_elapsed).toBe(0);
    });

    it("freezes a closed period at its last day instead of using today's odometer", () => {
        const { totals, bikes } = computeAllowance(settings, "2026-11-20", [bike("a", 1000, 3000, 1800)]);
        expect(totals.period_status).toBe("ended");
        expect(bikes[0].used_km).toBe(800); // 1800 - 1000, NOT 3000 - 1000
        expect(totals.days_left).toBe(0);
        expect(totals.projected_km).toBe(800);
    });

    it("says so when a closed period has no reading from its last day", () => {
        const { bikes } = computeAllowance(settings, "2026-11-20", [bike("a", 1000, 3000, null)]);
        expect(bikes[0].state).toBe("no_closing");
        expect(bikes[0].used_km).toBe(0);
    });
});
