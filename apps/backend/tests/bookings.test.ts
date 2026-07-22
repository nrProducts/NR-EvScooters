import { describe, expect, it } from "vitest";
import { isValidStartDay, toBookingView } from "../src/modules/bookings/bookings.service";

// Local-date formatting (NOT toISOString, which is UTC-based and can land
// on the wrong calendar day depending on the runner's timezone offset) —
// matches how isValidStartDay parses its input (new Date(`${d}T00:00:00`),
// which is local time).
const fmt = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/** Returns the next date matching `targetDow` (0=Sunday..6=Saturday) at or
 *  after `from`, so tests stay correct regardless of what day they run on. */
function nextDow(targetDow: number, from = new Date()): Date {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
    return d;
}

describe("isValidStartDay", () => {
    it("rejects a Sunday", () => {
        expect(isValidStartDay(fmt(nextDow(0)))).toBe(false);
    });

    it("accepts each of Monday through Saturday, in the future", () => {
        for (let dow = 1; dow <= 6; dow++) {
            expect(isValidStartDay(fmt(nextDow(dow, new Date(Date.now() + 24 * 3600 * 1000))))).toBe(true);
        }
    });

    it("accepts today when today is not a Sunday", () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (today.getDay() === 0) return; // skip on an actual Sunday test run
        expect(isValidStartDay(fmt(today))).toBe(true);
    });

    it("rejects a date in the past", () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        // Guard against yesterday landing on a Sunday, which would pass for
        // the wrong reason.
        if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 1);
        expect(isValidStartDay(fmt(yesterday))).toBe(false);
    });

    it("rejects a malformed date string", () => {
        expect(isValidStartDay("not-a-date")).toBe(false);
    });
});

describe("toBookingView", () => {
    it("maps a raw row into the API shape", () => {
        const view = toBookingView({
            id: "b-1",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: { id: "m-1", name: "NR Volt X1" },
            stations: { id: "s-1", name: "MG Road Hub", code: "STN-MGR" },
            plans: { id: "p-1", name: "NR Volt X1 — Daily", billing_cycle: "daily", price: 149 },
        });

        expect(view).toEqual({
            id: "b-1",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_model: { id: "m-1", name: "NR Volt X1" },
            station: { id: "s-1", name: "MG Road Hub", code: "STN-MGR" },
            plan: { id: "p-1", name: "NR Volt X1 — Daily", billing_cycle: "daily", price: 149 },
        });
    });

    it("unwraps single-element array joins (PostgREST array-of-one shape)", () => {
        const view = toBookingView({
            id: "b-2",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: [{ id: "m-1", name: "NR Volt X1" }],
            stations: [{ id: "s-1", name: "MG Road Hub", code: "STN-MGR" }],
            plans: [{ id: "p-1", name: "NR Volt X1 — Daily", billing_cycle: "daily", price: 149 }],
        });

        expect(view.vehicle_model).toEqual({ id: "m-1", name: "NR Volt X1" });
        expect(view.station).toEqual({ id: "s-1", name: "MG Road Hub", code: "STN-MGR" });
        expect(view.plan).toEqual({ id: "p-1", name: "NR Volt X1 — Daily", billing_cycle: "daily", price: 149 });
    });

    it("returns null joins when nothing is attached", () => {
        const view = toBookingView({
            id: "b-3",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: null,
            stations: null,
            plans: null,
        });

        expect(view.vehicle_model).toBeNull();
        expect(view.station).toBeNull();
        expect(view.plan).toBeNull();
    });
});
