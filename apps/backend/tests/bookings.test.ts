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
            vehicle: null,
            referral_discount_amount: null,
            cancelled_at: null,
            cancellation_reason: null,
            plan_price_at_cancellation: null,
            cancellation_penalty_amount: null,
            refund_amount: null,
            refund_status: null,
            plan_status: null,
            plan_activated_at: null,
            plan_duration_days: null,
            deposit_amount_at_booking: null,
            current_period_start: null,
            next_due_at: null,
            plan_paused_at: null,
            plan_paused_days_total: 0,
            active_rental: null,
            return_late_fee_preview: null,
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

    it("maps the allocated vehicle including its status", () => {
        const view = toBookingView({
            id: "b-4",
            status: "confirmed",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: { id: "m-1", name: "NR Volt X1" },
            stations: null,
            plans: null,
            vehicles: { id: "v-1", name: "Unit 12", registration_number: "KL-07-AB-1234", battery_percentage: 88, status: "booked" },
        });

        expect(view.vehicle).toEqual({
            id: "v-1", name: "Unit 12", registration_number: "KL-07-AB-1234", battery_percentage: 88, status: "booked",
        });
    });

    it("defaults referral_discount_amount to null when not stamped", () => {
        const view = toBookingView({
            id: "b-5",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: null,
            stations: null,
            plans: null,
        });

        expect(view.referral_discount_amount).toBeNull();
    });

    it("passes through the cancellation and refund fields", () => {
        const view = toBookingView({
            id: "b-7",
            status: "cancelled",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: null,
            stations: null,
            plans: null,
            cancelled_at: "2026-08-01T10:00:00.000Z",
            cancellation_reason: "Change of plans",
            plan_price_at_cancellation: 4000,
            cancellation_penalty_amount: 1000,
            refund_amount: 3000,
            refund_status: "pending",
        });

        expect(view.cancelled_at).toBe("2026-08-01T10:00:00.000Z");
        expect(view.cancellation_reason).toBe("Change of plans");
        expect(view.plan_price_at_cancellation).toBe(4000);
        expect(view.cancellation_penalty_amount).toBe(1000);
        expect(view.refund_amount).toBe(3000);
        expect(view.refund_status).toBe("pending");
    });

    it("passes through a stamped referral_discount_amount", () => {
        const view = toBookingView({
            id: "b-6",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_models: null,
            stations: null,
            plans: null,
            referral_discount_amount: 100,
        });

        expect(view.referral_discount_amount).toBe(100);
    });
});
