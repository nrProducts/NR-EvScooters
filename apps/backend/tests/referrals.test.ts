import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same mocking idiom as tests/damageWaive.test.ts: a per-table queue of
 * canned responses, consumed in the exact order the service code calls
 * `.from(table)`. Each test's queue is a trace of the real call sequence —
 * get that sequence wrong and the test fails loudly (a stub pops the wrong
 * queue, or runs dry), not silently.
 */
type Result = { data: unknown; error: unknown; count?: number };

class TableStub {
    constructor(private result: Result) {}
    select = () => this;
    insert = () => this;
    update = () => this;
    eq = () => this;
    neq = () => this;
    in = () => this;
    is = () => this;
    order = () => this;
    limit = () => this;
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
const calls: string[] = [];

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => {
            calls.push(table);
            const next = queues[table]?.shift();
            if (!next) throw new Error(`No queued result for table "${table}" (call #${calls.length})`);
            return new TableStub(next);
        },
    },
}));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: vi.fn().mockResolvedValue(undefined),
}));

import {
    getOrCreateReferralCode, isReferralExpired, qualifyReferralIfApplicable, redeemReferralCode,
} from "../src/modules/referrals/referrals.service";
import { redeemReferralBody } from "../src/modules/referrals/referrals.validation";
import { REFERRAL_CODE_EXPIRY_DAYS } from "../src/modules/referrals/referrals.constants";
import { AuthContext } from "../src/types";

beforeEach(() => {
    queues = {};
    calls.length = 0;
});

const actor = { id: "referee-1", role: "rider", permissions: new Set() } as unknown as AuthContext;

describe("isReferralExpired — the attribution cutoff", () => {
    it("is not expired right after account creation", () => {
        expect(isReferralExpired(new Date().toISOString())).toBe(false);
    });
    it("is not expired one day before the window closes", () => {
        const createdAt = new Date(Date.now() - (REFERRAL_CODE_EXPIRY_DAYS - 1) * 24 * 60 * 60 * 1000);
        expect(isReferralExpired(createdAt)).toBe(false);
    });
    it("is expired once the window has passed", () => {
        const createdAt = new Date(Date.now() - (REFERRAL_CODE_EXPIRY_DAYS + 1) * 24 * 60 * 60 * 1000);
        expect(isReferralExpired(createdAt)).toBe(true);
    });
});

describe("redeemReferralBody", () => {
    it("uppercases a 6-character code", () => {
        expect(redeemReferralBody.parse({ code: "ab12cd" }).code).toBe("AB12CD");
    });
    it("rejects a code that is too short", () => {
        expect(() => redeemReferralBody.parse({ code: "ab12" })).toThrow();
    });
    it("rejects a code that is too long", () => {
        expect(() => redeemReferralBody.parse({ code: "ab12cd34" })).toThrow();
    });
    it("rejects a missing code", () => {
        expect(() => redeemReferralBody.parse({})).toThrow();
    });
});

describe("getOrCreateReferralCode", () => {
    it("returns the existing code without ever writing — a reinstall or repeat open is a pure read", () => {
        queue("users", { data: { referral_code: "ABC123", role: "rider" }, error: null });
        return getOrCreateReferralCode("rider-1").then((code) => {
            expect(code).toBe("ABC123");
            expect(calls).toEqual(["users"]); // no UPDATE attempted
        });
    });

    it("assigns one when missing, guarded so a concurrent winner's code is read back rather than overwritten", async () => {
        queue("users", { data: { referral_code: null, role: "rider" }, error: null }); // read
        queue("users", { data: { referral_code: "NEWCDE" }, error: null }); // guarded UPDATE succeeds first try
        const code = await getOrCreateReferralCode("rider-2");
        expect(code).toBe("NEWCDE");
    });

    it("refuses to generate a code for a non-rider account", async () => {
        queue("users", { data: { referral_code: null, role: "admin" }, error: null });
        await expect(getOrCreateReferralCode("admin-1")).rejects.toThrow(/riders have a referral code/i);
    });
});

describe("redeemReferralCode", () => {
    it("rejects a rider's own code before ever looking up a referrer", async () => {
        queue("referrals", { data: null, error: null }); // findMyAttribution: none yet
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "MYOWN1", deleted_at: null }, error: null }); // the referee's own row
        await expect(redeemReferralCode("referee-1", "MYOWN1", actor)).rejects.toThrow(/own referral code/i);
        expect(calls).toEqual(["referrals", "users"]); // never reached a referrer lookup
    });

    it("refuses a code past the attribution cutoff, before any referrer lookup", async () => {
        const stale = new Date(Date.now() - (REFERRAL_CODE_EXPIRY_DAYS + 5) * 24 * 60 * 60 * 1000).toISOString();
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: stale, referral_code: "SELFCD", deleted_at: null }, error: null });
        await expect(redeemReferralCode("referee-1", "OTHR01", actor)).rejects.toThrow(/first 30 days/i);
    });

    it("rejects an unknown code with the SAME message a self-referral gets — no enumeration signal", async () => {
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null });
        queue("users", { data: null, error: null }); // no user holds this code
        await expect(redeemReferralCode("referee-1", "GHOST1", actor)).rejects.toThrow(/invalid or unavailable/i);
    });

    it("rejects a code belonging to a non-rider account", async () => {
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null });
        queue("users", { data: { id: "staff-1", full_name: "Staff Person", role: "staff", deleted_at: null }, error: null });
        await expect(redeemReferralCode("referee-1", "STAFFC", actor)).rejects.toThrow(/invalid or unavailable/i);
    });

    it("refuses when there is no enabled programme — the seeded default (disabled, ₹0)", async () => {
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null });
        queue("users", { data: { id: "referrer-1", full_name: "Referrer One", role: "rider", deleted_at: null }, error: null });
        queue("referral_programs", { data: null, error: null }); // nothing enabled
        await expect(redeemReferralCode("referee-1", "GOODCD", actor)).rejects.toThrow(/not available right now/i);
    });

    it("applies a valid code once, as a pending referral under a first_paid_booking programme", async () => {
        queue("referrals", { data: null, error: null }); // no existing attribution
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null }); // referee
        queue("users", { data: { id: "referrer-1", full_name: "Referrer One", role: "rider", deleted_at: null }, error: null }); // referrer
        queue("referral_programs", {
            data: { id: "prog-1", reward_amount: 200, reward_expiry_days: 90, qualifying_event: "first_paid_booking" },
            error: null,
        });
        queue("referrals", {
            data: { status: "pending", code_used: "GOODCD", created_at: "2026-10-10T00:00:00Z" },
            error: null,
        }); // the INSERT

        const result = await redeemReferralCode("referee-1", "GOODCD", actor);
        expect(result.outcome).toBe("applied");
        expect(result.attribution.status).toBe("pending");
        expect(result.attribution.referrer_display_name).toBe("Referrer");
        // Not qualified immediately: first_paid_booking has not happened yet,
        // so qualifyReferral's extra .from() calls must never fire here.
        expect(calls).toEqual(["referrals", "users", "users", "referral_programs", "referrals"]);
    });

    it("is idempotent — a second redeem for an already-attributed rider returns the SAME attribution, no new row", async () => {
        queue("referrals", {
            data: { status: "qualified", code_used: "GOODCD", created_at: "2026-10-10T00:00:00Z", referrer_user_id: "referrer-1" },
            error: null,
        });
        queue("users", { data: { full_name: "Referrer One" }, error: null }); // referrerDisplayName lookup

        const result = await redeemReferralCode("referee-1", "ANYCOD", actor);
        expect(result.outcome).toBe("already_applied");
        expect(result.attribution.code_used).toBe("GOODCD"); // the ORIGINAL code, not "ANYCOD"
        expect(result.attribution.status).toBe("qualified");
        expect(calls).toEqual(["referrals", "users"]); // never reached the self/cutoff/referrer/program checks
    });
});

describe("qualifyReferralIfApplicable — exactly-once card issuance on first_paid_booking", () => {
    it("no-ops when the referee has no pending first_paid_booking referral", async () => {
        queue("referrals", { data: null, error: null });
        const result = await qualifyReferralIfApplicable("referee-1", actor);
        expect(result.discount_amount).toBe(0);
        expect(calls).toEqual(["referrals"]); // never counted payments
    });

    it("no-ops before any payment has captured (the pre-payment booking.service.ts call sites)", async () => {
        queue("referrals", { data: { referrer_user_id: "referrer-1" }, error: null });
        queue("payment_orders", { data: null, error: null, count: 0 });
        const result = await qualifyReferralIfApplicable("referee-1", actor);
        expect(result.discount_amount).toBe(0);
        expect(calls).toEqual(["referrals", "payment_orders"]); // never re-fetched/updated the referral
    });

    it("no-ops forever once the referee already had a SECOND paid booking (no longer their first)", async () => {
        queue("referrals", { data: { referrer_user_id: "referrer-1" }, error: null });
        queue("payment_orders", { data: null, error: null, count: 2 });
        const result = await qualifyReferralIfApplicable("referee-2", actor);
        expect(result.discount_amount).toBe(0);
        expect(calls).toEqual(["referrals", "payment_orders"]);
    });

    it("qualifies and issues a card on the FIRST paid booking", async () => {
        queue("referrals", { data: { referrer_user_id: "referrer-1" }, error: null }); // the pending lookup
        queue("payment_orders", { data: null, error: null, count: 1 }); // exactly one paid order: this one
        queue("bookings", { data: { id: "booking-1" }, error: null }); // best-effort booking reference
        queue("referrals", { data: { id: "referral-1", program_id: "prog-1", status: "pending" }, error: null }); // qualifyReferral re-fetch
        queue("referrals", { data: { id: "referral-1" }, error: null }); // the guarded UPDATE succeeds
        queue("referral_programs", { data: { reward_amount: 200, reward_expiry_days: 90 }, error: null });
        queue("referral_reward_cards", { data: null, error: null }); // the INSERT succeeds

        const result = await qualifyReferralIfApplicable("referee-3", actor);
        expect(result.discount_amount).toBe(0); // the card model has no same-transaction referee discount
        expect(calls).toEqual([
            "referrals", "payment_orders", "bookings", "referrals", "referrals", "referral_programs", "referral_reward_cards",
        ]);
    });

    it("stays idempotent when the status transition has already been won by a concurrent call", async () => {
        queue("referrals", { data: { referrer_user_id: "referrer-1" }, error: null });
        queue("payment_orders", { data: null, error: null, count: 1 });
        queue("bookings", { data: { id: "booking-1" }, error: null });
        queue("referrals", { data: { id: "referral-1", program_id: "prog-1", status: "pending" }, error: null });
        // The guarded UPDATE (eq status='pending') matches zero rows — someone
        // else's call already flipped it.
        queue("referrals", { data: null, error: null });

        await qualifyReferralIfApplicable("referee-4", actor);
        // Must stop there: no program lookup, no card insert — a second card
        // for the same referral would violate uq_reward_cards_referral even
        // if this DID try, but it should never even attempt it.
        expect(calls).toEqual(["referrals", "payment_orders", "bookings", "referrals", "referrals"]);
    });

    it("swallows a duplicate card insert (23505) rather than throwing — a webhook retry racing itself", async () => {
        queue("referrals", { data: { referrer_user_id: "referrer-1" }, error: null });
        queue("payment_orders", { data: null, error: null, count: 1 });
        queue("bookings", { data: { id: "booking-1" }, error: null });
        queue("referrals", { data: { id: "referral-1", program_id: "prog-1", status: "pending" }, error: null });
        queue("referrals", { data: { id: "referral-1" }, error: null });
        queue("referral_programs", { data: { reward_amount: 200, reward_expiry_days: 90 }, error: null });
        queue("referral_reward_cards", { data: null, error: { code: "23505" } });

        await expect(qualifyReferralIfApplicable("referee-5", actor)).resolves.toEqual({ discount_amount: 0 });
    });

    it("qualifies the referral but issues NO card when the programme's reward is ₹0 at the moment of qualification", async () => {
        queue("referrals", { data: { referrer_user_id: "referrer-1" }, error: null });
        queue("payment_orders", { data: null, error: null, count: 1 });
        queue("bookings", { data: { id: "booking-1" }, error: null });
        queue("referrals", { data: { id: "referral-1", program_id: "prog-1", status: "pending" }, error: null });
        queue("referrals", { data: { id: "referral-1" }, error: null });
        queue("referral_programs", { data: { reward_amount: 0, reward_expiry_days: 90 }, error: null });

        await qualifyReferralIfApplicable("referee-6", actor);
        // Stops after reading the program — never reaches referral_reward_cards.
        expect(calls).toEqual(["referrals", "payment_orders", "bookings", "referrals", "referrals", "referral_programs"]);
    });
});
