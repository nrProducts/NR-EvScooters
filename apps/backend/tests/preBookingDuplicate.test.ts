import { describe, expect, it, vi } from "vitest";

/**
 * preBookingExistsForPhone — the duplicate-number check public.routes.ts
 * runs before submitPreBooking, so a repeat submission from the same number
 * gets a clear 409 ("you've already pre-booked") instead of a second row.
 *
 * Unit-level, not the full HTTP route (public-pre-book.route.test.ts covers
 * that): the test environment has no live Supabase, so the route test can't
 * seed an existing row to actually trigger this path. Mocking supabaseAdmin
 * directly is the only way to exercise "found" vs "not found" vs "the query
 * itself failed" — mirrors damageWaive.test.ts's TableStub pattern.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    constructor(private result: Result) {}
    select = () => this;
    eq = () => this;
    limit = () => this;
    maybeSingle = () => Promise.resolve(this.result);
}

let queued: Result;

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: () => new TableStub(queued),
    },
}));

const { preBookingExistsForPhone } = await import("../src/modules/public/preBooking.service");

describe("preBookingExistsForPhone", () => {
    it("is true when a row with this phone already exists", async () => {
        queued = { data: { id: "existing-row" }, error: null };
        expect(await preBookingExistsForPhone("9876543210")).toBe(true);
    });

    it("is false when no row matches", async () => {
        queued = { data: null, error: null };
        expect(await preBookingExistsForPhone("9876543211")).toBe(false);
    });

    it("fails OPEN (false) when the query itself errors, so a DB blip never blocks a legitimate submission", async () => {
        queued = { data: null, error: { message: "connection refused" } };
        expect(await preBookingExistsForPhone("9876543212")).toBe(false);
    });
});
