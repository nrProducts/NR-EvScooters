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

/**
 * `toBookingView(row, ctx)` takes two arguments now, and that is the shape of
 * the whole change.
 *
 * A booking lost 23 columns. Everything about the PLAN — its status, its
 * dates, the pause total, the scheduled renewal — belongs to the subscription
 * and its periods; the cancellation is a `booking_cancellations` row; the
 * refund is a `refunds` row; the referral discount is a
 * `subscription_adjustments` row with a negative amount. None of it can be
 * read off the booking, so it arrives as an assembled CONTEXT.
 *
 * What stayed on the row is exactly what a reservation is: who, which plan,
 * which hub, which day, and the snapshots of what was agreed.
 */
const EMPTY_CTX = {
    subscriptionId: null,
    planStatus: null,
    subscriptionEnded: false,
    planActivatedAt: null,
    planDurationDays: null,
    currentPeriodStart: null,
    nextDueAt: null,
    pausedAt: null,
    pausedDaysTotal: 0,
    renewalStatus: "none" as const,
    scheduledStartDate: null,
    scheduledDurationDays: null,
    lateFeeOverride: null,
    referralDiscountAmount: null,
    cancelledAt: null,
    cancellationReason: null,
    cancellationPenaltyAmount: null,
    refundAmount: null,
    refundStatus: null,
    refundInitiatedAt: null,
    refundCompletedAt: null,
    refundTransactionId: null,
    activeRental: null,
    currentVehicleId: null,
};

/** A minimal reservation, with the snapshots the view needs. */
const baseRow = {
    id: "b-1",
    user_id: "u-1",
    status: "pending_payment" as const,
    requested_start_on: "2026-08-03",
    created_at: "2026-07-22T00:00:00.000Z",
    held_vehicle_id: null,
    hold_expires_at: null,
    plan_price_snapshot: 149,
    duration_days_snapshot: 1,
    deposit_amount_snapshot: 2000,
    vehicle_models: null,
    hubs: null,
    plans: null,
    vehicles: null,
};

describe("toBookingView", () => {
    it("maps a raw row into the API shape", () => {
        const view = toBookingView({
            ...baseRow,
            // The model comes THROUGH the plan: a booking names a plan, and a
            // plan names exactly one model, so `bookings.vehicle_model_id`
            // was a second answer to a question the plan already settled.
            vehicle_models: { vehicle_models: { id: "m-1", name: "NR Volt X1" } },
            hubs: { id: "s-1", name: "MG Road Hub", code: "STN-MGR", latitude: 12.97, longitude: 77.6 },
            plans: { id: "p-1", name: "NR Volt X1 — Daily", billing_period: "daily" },
        }, EMPTY_CTX);

        expect(view).toEqual({
            id: "b-1",
            status: "pending_payment",
            start_day: "2026-08-03",
            created_at: "2026-07-22T00:00:00.000Z",
            vehicle_model: { id: "m-1", name: "NR Volt X1" },
            station: { id: "s-1", name: "MG Road Hub", code: "STN-MGR", lat: 12.97, lng: 77.6 },
            // Priced from the SNAPSHOTS, not the live plan row: a repricing
            // must not rewrite what someone already agreed to.
            plan: {
                id: "p-1", name: "NR Volt X1 — Daily", billing_cycle: "daily",
                price: 149, duration_days: 1, deposit_amount: 2000,
            },
            vehicle: null,
            referral_discount_amount: null,
            cancelled_at: null,
            cancellation_reason: null,
            plan_price_at_cancellation: null,
            cancellation_penalty_amount: null,
            refund_amount: null,
            refund_status: null,
            refund_initiated_at: null,
            refund_completed_at: null,
            refund_transaction_id: null,
            plan_status: null,
            plan_activated_at: null,
            plan_duration_days: null,
            deposit_amount_at_booking: 2000,
            current_period_start: null,
            next_due_at: null,
            plan_paused_at: null,
            plan_paused_days_total: 0,
            renewal_status: "none",
            scheduled_start_date: null,
            scheduled_duration_days: null,
            late_fee_override: null,
            active_rental: null,
            return_late_fee_preview: null,
        });
    });

    it("unwraps single-element array joins (PostgREST array-of-one shape)", () => {
        const view = toBookingView({
            ...baseRow,
            id: "b-2",
            vehicle_models: [{ vehicle_models: [{ id: "m-1", name: "NR Volt X1" }] }],
            hubs: [{ id: "s-1", name: "MG Road Hub", code: "STN-MGR", latitude: 12.97, longitude: 77.6 }],
            plans: [{ id: "p-1", name: "NR Volt X1 — Daily", billing_period: "daily" }],
        }, EMPTY_CTX);

        expect(view.vehicle_model).toEqual({ id: "m-1", name: "NR Volt X1" });
        expect(view.station).toMatchObject({ id: "s-1", name: "MG Road Hub", code: "STN-MGR" });
        expect(view.plan).toMatchObject({ id: "p-1", billing_cycle: "daily" });
    });

    it("returns null joins when nothing is attached", () => {
        const view = toBookingView({ ...baseRow, id: "b-3" }, EMPTY_CTX);

        expect(view.vehicle_model).toBeNull();
        expect(view.station).toBeNull();
        expect(view.plan).toBeNull();
    });

    // Battery percentage is gone: a battery is swapped at a station, so it was
    // never a property of a scooter. `name` falls back to the model's, because
    // `display_name` is nullable — a vehicle can just be its plate.
    it("maps the allocated vehicle, falling back to the model name", () => {
        const view = toBookingView({
            ...baseRow,
            id: "b-4",
            status: "confirmed",
            vehicles: {
                id: "v-1", display_name: "Unit 12", registration_number: "KL-07-AB-1234",
                status: "reserved", vehicle_models: { name: "NR Volt X1" },
            },
        }, EMPTY_CTX);

        expect(view.vehicle).toEqual({
            id: "v-1", name: "Unit 12", registration_number: "KL-07-AB-1234", status: "reserved",
        });
    });

    it("uses the model name when the vehicle has no display name", () => {
        const view = toBookingView({
            ...baseRow,
            vehicles: {
                id: "v-2", display_name: null, registration_number: "KL-07-AB-9999",
                status: "available", vehicle_models: { name: "NR Volt X1" },
            },
        }, EMPTY_CTX);

        expect(view.vehicle?.name).toBe("NR Volt X1");
    });

    it("defaults referral_discount_amount to null when there is no adjustment", () => {
        expect(toBookingView(baseRow, EMPTY_CTX).referral_discount_amount).toBeNull();
    });

    // All of these came off the booking row and now arrive through the
    // context, assembled from booking_cancellations and refunds.
    it("passes through the cancellation and refund fields", () => {
        const view = toBookingView({ ...baseRow, id: "b-7", status: "cancelled" }, {
            ...EMPTY_CTX,
            cancelledAt: "2026-08-01T10:00:00.000Z",
            cancellationReason: "Change of plans",
            cancellationPenaltyAmount: 1000,
            refundAmount: 3000,
            refundStatus: "processed" as const,
            refundInitiatedAt: "2026-08-01T10:00:01.000Z",
            refundCompletedAt: "2026-08-01T10:00:05.000Z",
            refundTransactionId: "rfnd_test123",
        });

        expect(view.cancelled_at).toBe("2026-08-01T10:00:00.000Z");
        expect(view.cancellation_reason).toBe("Change of plans");
        expect(view.cancellation_penalty_amount).toBe(1000);
        expect(view.refund_amount).toBe(3000);
        expect(view.refund_status).toBe("processed");
        expect(view.refund_initiated_at).toBe("2026-08-01T10:00:01.000Z");
        expect(view.refund_completed_at).toBe("2026-08-01T10:00:05.000Z");
        expect(view.refund_transaction_id).toBe("rfnd_test123");
    });

    /**
     * `plan_price_at_cancellation` is RECONSTRUCTED, not stored.
     *
     * The net owed at cancel time is the agreed price less any discount, and
     * the snapshot plus the adjustment still give exactly that — so the
     * column was a third copy of a number two other rows already determined.
     */
    it("reconstructs the price at cancellation from the snapshot and the discount", () => {
        const view = toBookingView({ ...baseRow, plan_price_snapshot: 4000 }, {
            ...EMPTY_CTX,
            cancelledAt: "2026-08-01T10:00:00.000Z",
            referralDiscountAmount: 100,
        });

        expect(view.plan_price_at_cancellation).toBe(3900);
    });

    it("never reports a negative price at cancellation", () => {
        const view = toBookingView({ ...baseRow, plan_price_snapshot: 50 }, {
            ...EMPTY_CTX,
            cancelledAt: "2026-08-01T10:00:00.000Z",
            referralDiscountAmount: 100,
        });

        expect(view.plan_price_at_cancellation).toBe(0);
    });

    it("leaves the price at cancellation null when nothing was cancelled", () => {
        expect(toBookingView(baseRow, { ...EMPTY_CTX, referralDiscountAmount: 100 })
            .plan_price_at_cancellation).toBeNull();
    });

    it("passes through a referral discount from the adjustment", () => {
        const view = toBookingView({ ...baseRow, id: "b-6" }, {
            ...EMPTY_CTX, referralDiscountAmount: 100,
        });

        expect(view.referral_discount_amount).toBe(100);
    });

    /**
     * `completed` is derived, never stored.
     *
     * `booking_status` has no such value — a fulfilled booking whose
     * subscription has ended IS completed, and storing that separately gave
     * two places to disagree about when a rental was over.
     */
    it("reports a fulfilled booking as completed once its subscription ends", () => {
        const fulfilled = { ...baseRow, status: "fulfilled" as const };
        expect(toBookingView(fulfilled, EMPTY_CTX).status).toBe("fulfilled");
        expect(toBookingView(fulfilled, { ...EMPTY_CTX, subscriptionEnded: true }).status)
            .toBe("completed");
    });

    it("does not report a cancelled booking as completed", () => {
        const cancelled = { ...baseRow, status: "cancelled" as const };
        expect(toBookingView(cancelled, { ...EMPTY_CTX, subscriptionEnded: true }).status)
            .toBe("cancelled");
    });
});
