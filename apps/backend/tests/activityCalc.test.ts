import { describe, expect, it } from "vitest";
import { computeDailyActivity, GAP_CAP_MS, ignitionOn, istDay } from "../src/modules/telematics/activity.calc";

// 27 Oct 2026, 10:00 IST = 04:30 UTC
const T0 = Date.parse("2026-10-27T04:30:00Z");
const sec = (n: number) => T0 + n * 1000;

describe("istDay", () => {
    it("puts an instant on its IST day, not its UTC day", () => {
        expect(istDay(Date.parse("2026-10-26T18:29:59Z"))).toBe("2026-10-26"); // 23:59:59 IST
        expect(istDay(Date.parse("2026-10-26T18:30:00Z"))).toBe("2026-10-27"); // 00:00:00 IST
    });
});

describe("ignitionOn", () => {
    it("reads both the history format (1/0) and the status format (on/off)", () => {
        expect(ignitionOn({ commtime: 0, ignstatus: 1 })).toBe(true);
        expect(ignitionOn({ commtime: 0, ignstatus: "on" })).toBe(true);
        expect(ignitionOn({ commtime: 0, ignstatus: 0 })).toBe(false);
        expect(ignitionOn({ commtime: 0, ignstatus: "off" })).toBe(false);
        expect(ignitionOn({ commtime: 0 })).toBe(false);
    });
});

describe("computeDailyActivity", () => {
    it("adds up ignition time, moving time and trips", () => {
        const r = computeDailyActivity([
            { commtime: sec(0), ignstatus: 0, speed: 0 },
            { commtime: sec(60), ignstatus: 1, speed: 0 },    // trip 1 starts (idle 60 s)
            { commtime: sec(120), ignstatus: 1, speed: 20 },  // idle ends -> moving next
            { commtime: sec(180), ignstatus: 1, speed: 25 },  // moving 60 s
            { commtime: sec(240), ignstatus: 0, speed: 0 },   // moving 60 s, then key off
            { commtime: sec(300), ignstatus: 1, speed: 0 },   // trip 2 starts
            { commtime: sec(360), ignstatus: 0, speed: 0 },   // idle 60 s
        ]).get("2026-10-27")!;
        // key on for: 60 (idle) + 60 + 60 (moving) + 60 (trip 2) = 240 s
        expect(r.ignition_hours).toBeCloseTo(240 / 3600, 2);
        // moving: readings at 120 s and 180 s are above 2 km/h => 120 s
        expect(r.moving_hours).toBeCloseTo(120 / 3600, 2);
        expect(r.trips).toBe(2);
    });

    it("never counts a long silence as running time", () => {
        const r = computeDailyActivity([
            { commtime: sec(0), ignstatus: 1, speed: 30 },
            { commtime: sec(3600), ignstatus: 1, speed: 30 }, // one hour later
        ]).get("2026-10-27")!;
        // the first reading is credited at most GAP_CAP_MS, not the hour
        expect(r.ignition_hours).toBeCloseTo(GAP_CAP_MS / 3_600_000, 2);
        expect(r.moving_hours).toBeCloseTo(GAP_CAP_MS / 3_600_000, 2);
    });

    it("splits readings across IST days", () => {
        const before = Date.parse("2026-10-26T18:29:00Z"); // 23:59 IST on the 26th
        const after = Date.parse("2026-10-26T18:31:00Z");  // 00:01 IST on the 27th
        const m = computeDailyActivity([
            { commtime: before, ignstatus: 1, speed: 10 },
            { commtime: before + 30_000, ignstatus: 1, speed: 10 },
            { commtime: after, ignstatus: 1, speed: 10 },
            { commtime: after + 30_000, ignstatus: 1, speed: 10 },
        ]);
        // An interval belongs to the day it STARTS in: the 26th gets 30 s + the 90 s
        // from its last reading up to the first one after midnight; the 27th gets 30 s.
        expect(m.get("2026-10-26")!.ignition_hours).toBeCloseTo(120 / 3600, 2);
        expect(m.get("2026-10-27")!.ignition_hours).toBeCloseTo(30 / 3600, 2);
        expect(m.get("2026-10-26")!.trips).toBe(1);
        expect(m.get("2026-10-27")!.trips).toBe(0); // the ignition was already on — not a new trip
    });

    it("returns nothing for no readings and ignores unusable ones", () => {
        expect(computeDailyActivity([]).size).toBe(0);
        expect(computeDailyActivity([{ commtime: Number.NaN }]).size).toBe(0);
    });
});
