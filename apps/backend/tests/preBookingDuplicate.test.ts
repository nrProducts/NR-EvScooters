import { describe, expect, it, vi } from "vitest";

/**
 * submitPreBooking's duplicate-number rule: a repeat submission from a
 * number that already has a pre_bookings row gets a 409 ("you've already
 * pre-booked") instead of a second row and a second email.
 *
 * Unit-level, not the full HTTP route (public-pre-book.route.test.ts covers
 * that): the test environment has no live Supabase, so the route test can't
 * seed an existing row to actually trigger this path. Mirrors
 * damageWaive.test.ts's TableStub/queue pattern — a plain array per table so
 * submitPreBooking's TWO sequential calls to "pre_bookings" in one run (the
 * duplicate check, then the insert) each get their own queued result.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    constructor(private result: Result) {}
    select = () => this;
    insert = () => this;
    eq = () => this;
    limit = () => this;
    abortSignal = () => this;
    maybeSingle = () => Promise.resolve(this.result);
    single = () => Promise.resolve(this.result);
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;

function queue(table: string, result: Result) {
    (queues[table] ??= []).push(result);
}

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => new TableStub(queues[table]?.shift() ?? { data: null, error: null }),
    },
}));

vi.mock("../src/config/resend", () => ({
    isEmailConfigured: () => true,
    getResend: () => ({
        emails: {
            send: vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null }),
        },
    }),
}));

const { submitPreBooking } = await import("../src/modules/public/preBooking.service");
import type { PreBookingBody } from "../src/modules/public/public.validation";

const INPUT: PreBookingBody = {
    full_name: "Priya Sharma",
    phone: "9876543210",
    location: "Medavakkam, Chennai",
    email: "priya@example.com",
    plan_preference: "weekly",
    message: undefined,
};

describe("submitPreBooking — duplicate phone", () => {
    it("throws a 409 conflict when this phone has already pre-booked, without sending an email", async () => {
        queues = {};
        queue("pre_bookings", { data: { id: "existing-row" }, error: null }); // the duplicate check

        await expect(submitPreBooking(INPUT)).rejects.toMatchObject({
            status: 409,
            message: expect.stringMatching(/already submitted a pre-booking request/i),
        });
    });

    it("proceeds normally (persists + emails) when no existing row matches", async () => {
        queues = {};
        queue("pre_bookings", { data: null, error: null }); // the duplicate check — none found
        queue("pre_bookings", { data: null, error: null }); // the insert

        const result = await submitPreBooking(INPUT);
        expect(result.provider_ref).toBe("email-1");
    });

    it("fails open — a duplicate-check query error still lets a genuine new submission through", async () => {
        queues = {};
        queue("pre_bookings", { data: null, error: { message: "connection refused" } }); // the duplicate check errors
        queue("pre_bookings", { data: null, error: null }); // the insert still runs

        const result = await submitPreBooking(INPUT);
        expect(result.provider_ref).toBe("email-1");
    });
});
