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
    upsert = () => this;
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

/** Same idea as the table queue, keyed on RPC name instead. */
let rpcQueues: Record<string, Result[]>;
function queueRpc(fn: string, result: Result) {
    (rpcQueues[fn] ??= []).push(result);
}
const rpcCalls: { fn: string; args: unknown }[] = [];

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => {
            calls.push(table);
            const next = queues[table]?.shift();
            if (!next) throw new Error(`No queued result for table "${table}" (call #${calls.length})`);
            return new TableStub(next);
        },
        rpc: (fn: string, args: unknown) => {
            rpcCalls.push({ fn, args });
            const next = rpcQueues[fn]?.shift();
            if (!next) throw new Error(`No queued RPC result for "${fn}" (call #${rpcCalls.length})`);
            return Promise.resolve(next);
        },
    },
}));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: vi.fn().mockResolvedValue(undefined),
}));

import {
    applyCardToInvoice, confirmCardRedemptionForInvoice, getOrCreateReferralCode, getUserReferralsForAdmin, isReferralExpired,
    qualifyReferralIfApplicable, redeemReferralCode, releaseCardFromInvoice, releaseCardIfReservedForInvoice,
} from "../src/modules/referrals/referrals.service";
import { redeemReferralBody } from "../src/modules/referrals/referrals.validation";
import { REFERRAL_CODE_EXPIRY_DAYS } from "../src/modules/referrals/referrals.constants";
import { AuthContext } from "../src/types";

beforeEach(() => {
    queues = {};
    rpcQueues = {};
    rpcCalls.length = 0;
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

    it("refuses a code whose owner has not booked a scooter yet", async () => {
        // KYC done, no booking: a rider may not refer until they have booked
        // themselves — enforced at redemption, not just hidden in the app.
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null });
        queue("users", { data: { id: "referrer-1", full_name: "Referrer One", role: "rider", deleted_at: null }, error: null });
        queue("subscriptions", { data: null, error: null, count: 0 }); // never booked
        await expect(redeemReferralCode("referee-1", "GOODCD", actor))
            .rejects.toThrow(/needs to book a scooter first/i);
        expect(calls).not.toContain("referral_programs"); // stopped before anything else
    });

    it("refuses when there is no enabled programme — the seeded default (disabled, ₹0)", async () => {
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null });
        queue("users", { data: { id: "referrer-1", full_name: "Referrer One", role: "rider", deleted_at: null }, error: null });
        queue("subscriptions", { data: null, error: null, count: 1 }); // referrer has booked
        queue("referral_programs", { data: null, error: null }); // nothing enabled
        await expect(redeemReferralCode("referee-1", "GOODCD", actor)).rejects.toThrow(/not available right now/i);
    });

    it("applies a valid code once, as a pending referral under a first_paid_booking programme", async () => {
        queue("referrals", { data: null, error: null }); // no existing attribution
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null }, error: null }); // referee
        queue("users", { data: { id: "referrer-1", full_name: "Referrer One", role: "rider", deleted_at: null }, error: null }); // referrer
        queue("subscriptions", { data: null, error: null, count: 1 }); // referrer has booked
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
        expect(calls).toEqual(["referrals", "users", "users", "subscriptions", "referral_programs", "referrals"]);
    });

    it("records an identity mark on success when the referee has a phone on file", async () => {
        queue("referrals", { data: null, error: null });
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null, phone: "+919600999046" }, error: null });
        queue("referral_identity_marks", { data: null, error: null }); // no prior mark for this phone
        queue("users", { data: { id: "referrer-1", full_name: "Referrer One", role: "rider", deleted_at: null }, error: null });
        queue("subscriptions", { data: null, error: null, count: 1 }); // referrer has booked
        queue("referral_programs", {
            data: { id: "prog-1", reward_amount: 200, reward_expiry_days: 90, qualifying_event: "first_paid_booking" },
            error: null,
        });
        queue("referrals", { data: { status: "pending", code_used: "GOODCD", created_at: "2026-10-10T00:00:00Z" }, error: null });
        queue("referral_identity_marks", { data: null, error: null }); // the upsert

        const result = await redeemReferralCode("referee-phone", "GOODCD", actor);
        expect(result.outcome).toBe("applied");
        expect(calls).toEqual([
            "referrals", "users", "referral_identity_marks", "users", "subscriptions", "referral_programs", "referrals", "referral_identity_marks",
        ]);
    });

    it("refuses redemption when this phone identity has already redeemed a code under a DIFFERENT (e.g. deleted-and-recreated) account", async () => {
        queue("referrals", { data: null, error: null }); // no attribution on THIS account
        queue("users", { data: { created_at: new Date().toISOString(), referral_code: "SELFCD", deleted_at: null, phone: "9600999046" }, error: null });
        queue("referral_identity_marks", { data: { id: "mark-1" }, error: null }); // this phone already has a mark

        await expect(redeemReferralCode("referee-recreated", "GOODCD", actor)).rejects.toThrow(/already been redeemed with this phone/i);
        // Refused before ever looking up the referrer or touching the programme.
        expect(calls).toEqual(["referrals", "users", "referral_identity_marks"]);
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

describe("applyCardToInvoice", () => {
    it("reserves the discount and returns the breakdown on success", async () => {
        queue("invoices", { data: { total_amount: 1500, user_id: "rider-1" }, error: null });
        queue("referral_programs", { data: { min_renewal_amount: 100 }, error: null });
        queueRpc("reserve_referral_card_redemption", {
            data: {
                id: "redemption-1", status: "reserved", invoice_id: "invoice-1",
                original_amount: 1500, discount_amount: 200, final_amount: 1300, reserved_at: "2026-10-11T00:00:00Z",
            },
            error: null,
        });

        const result = await applyCardToInvoice("rider-1", "card-1", "invoice-1", actor);
        expect(result).toEqual({
            id: "redemption-1", status: "reserved", invoice_id: "invoice-1",
            original_amount: 1500, discount_amount: 200, final_amount: 1300, reserved_at: "2026-10-11T00:00:00Z",
        });
        expect(rpcCalls).toEqual([
            { fn: "reserve_referral_card_redemption", args: { p_card_id: "card-1", p_invoice_id: "invoice-1", p_user_id: "rider-1" } },
        ]);
    });

    it("refuses an invoice belonging to someone else, before ever calling the RPC", async () => {
        queue("invoices", { data: { total_amount: 1500, user_id: "someone-else" }, error: null });
        await expect(applyCardToInvoice("rider-1", "card-1", "invoice-1", actor)).rejects.toThrow(/could not be found/i);
        expect(rpcCalls).toEqual([]);
    });

    it("refuses when the invoice is below the live minimum renewal amount", async () => {
        queue("invoices", { data: { total_amount: 50, user_id: "rider-1" }, error: null });
        queue("referral_programs", { data: { min_renewal_amount: 100 }, error: null });
        await expect(applyCardToInvoice("rider-1", "card-1", "invoice-1", actor)).rejects.toThrow(/at least.*100/i);
        expect(rpcCalls).toEqual([]);
    });

    it("maps a card_not_available RPC refusal to a friendly message", async () => {
        queue("invoices", { data: { total_amount: 1500, user_id: "rider-1" }, error: null });
        queue("referral_programs", { data: { min_renewal_amount: 100 }, error: null });
        queueRpc("reserve_referral_card_redemption", { data: null, error: { code: "P0001", message: "card_not_available" } });
        await expect(applyCardToInvoice("rider-1", "card-1", "invoice-1", actor)).rejects.toThrow(/not available to use/i);
    });
});

describe("releaseCardFromInvoice", () => {
    it("releases a reserved redemption the caller owns", async () => {
        queue("referral_card_redemptions", { data: { id: "redemption-1", user_id: "rider-1", status: "reserved" }, error: null });
        queueRpc("release_referral_card_redemption", { data: null, error: null });

        await releaseCardFromInvoice("rider-1", "redemption-1", actor);
        expect(rpcCalls).toEqual([
            { fn: "release_referral_card_redemption", args: { p_redemption_id: "redemption-1", p_reason: "Rider removed the card before paying." } },
        ]);
    });

    it("refuses a redemption belonging to someone else", async () => {
        queue("referral_card_redemptions", { data: { id: "redemption-1", user_id: "someone-else", status: "reserved" }, error: null });
        await expect(releaseCardFromInvoice("rider-1", "redemption-1", actor)).rejects.toThrow(/could not be found/i);
        expect(rpcCalls).toEqual([]);
    });

    it("is a silent no-op for an already-settled or already-released redemption — never calls the RPC", async () => {
        queue("referral_card_redemptions", { data: { id: "redemption-1", user_id: "rider-1", status: "redeemed" }, error: null });
        await releaseCardFromInvoice("rider-1", "redemption-1", actor);
        expect(rpcCalls).toEqual([]);
    });
});

describe("confirmCardRedemptionForInvoice — called from payment settlement, must never throw", () => {
    it("confirms via RPC on the ordinary path", async () => {
        queueRpc("confirm_referral_card_redemption", { data: null, error: null });
        await confirmCardRedemptionForInvoice("invoice-1");
        expect(rpcCalls).toEqual([{ fn: "confirm_referral_card_redemption", args: { p_invoice_id: "invoice-1" } }]);
    });

    it("swallows an RPC failure rather than throwing into the payment-capture flow", async () => {
        queueRpc("confirm_referral_card_redemption", { data: null, error: new Error("boom") });
        await expect(confirmCardRedemptionForInvoice("invoice-1")).resolves.toBeUndefined();
    });
});

describe("releaseCardIfReservedForInvoice — called before voiding an abandoned renewal, must never throw", () => {
    it("does nothing, and never calls the RPC, when no card was reserved", async () => {
        queue("referral_card_redemptions", { data: null, error: null });
        await releaseCardIfReservedForInvoice("invoice-1");
        expect(rpcCalls).toEqual([]);
    });

    it("releases the reservation when one exists", async () => {
        queue("referral_card_redemptions", { data: { id: "redemption-1" }, error: null });
        queueRpc("release_referral_card_redemption", { data: null, error: null });
        await releaseCardIfReservedForInvoice("invoice-1");
        expect(rpcCalls).toEqual([
            { fn: "release_referral_card_redemption", args: { p_redemption_id: "redemption-1", p_reason: "The invoice itself was voided — the period it billed for was never bought." } },
        ]);
    });

    it("swallows a failure rather than throwing — the invoice must still get voided", async () => {
        queue("referral_card_redemptions", { data: null, error: new Error("boom") });
        await expect(releaseCardIfReservedForInvoice("invoice-1")).resolves.toBeUndefined();
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

describe("getUserReferralsForAdmin — a user's place in the referral graph", () => {
    const row = (over: Record<string, unknown>) => ({
        id: "ref-1", status: "pending", code_used: "AB12CD", qualified_at: null, created_at: "2026-10-01T00:00:00Z",
        referrer_user_id: "referrer-1", referee_user_id: "me", ...over,
    });

    it("returns who referred the user and everyone the user referred, with names and phones", async () => {
        queue("referrals", { data: [row({ id: "above" })], error: null });
        queue("referrals", {
            data: [
                row({ id: "b1", referrer_user_id: "me", referee_user_id: "kid-1", status: "qualified", qualified_at: "2026-10-05T00:00:00Z" }),
                row({ id: "b2", referrer_user_id: "me", referee_user_id: "kid-2" }),
            ],
            error: null,
        });
        queue("users", {
            data: [
                { id: "referrer-1", full_name: "Asha", phone: "+911111111111", status: "active" },
                { id: "kid-1", full_name: "Bala", phone: "+912222222222", status: "active" },
                { id: "kid-2", full_name: "Chitra", phone: null, status: "pending" },
            ],
            error: null,
        });

        const out = await getUserReferralsForAdmin("me");

        expect(out.referred_by?.person).toMatchObject({ id: "referrer-1", full_name: "Asha", phone: "+911111111111" });
        expect(out.referred.map((r) => r.person.full_name)).toEqual(["Bala", "Chitra"]);
        expect(out.referred_count).toBe(2);
        expect(out.qualified_count).toBe(1);
    });

    it("has no referrer and an empty list for a user outside the referral graph, and skips the users lookup", async () => {
        queue("referrals", { data: [], error: null });
        queue("referrals", { data: [], error: null });

        const out = await getUserReferralsForAdmin("me");

        expect(out).toEqual({ referred_by: null, referred: [], referred_count: 0, qualified_count: 0 });
        expect(calls).not.toContain("users");
    });
});
