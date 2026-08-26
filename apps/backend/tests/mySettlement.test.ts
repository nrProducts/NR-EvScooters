import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type QueryHandler } from "./helpers/fakeSupabase";

/**
 * GET /rentals/me/settlement must return the CALLER'S settlement, or none.
 *
 * It returned someone else's. The ownership filter was
 * `.eq("rentals.user_id", userId)` against an embed declared as
 * `rentals(...)` rather than `rentals!inner(...)`, and PostgREST applies a
 * filter on an embedded column to the EMBED, not to the parent row: the
 * `rentals` object came back null on non-matching rows and every
 * `rental_settlements` row survived. With `.order(settled_at desc).limit(1)`
 * on top, every rider was served the newest settlement in the entire table.
 *
 * What that looked like in the app: a rider 25 days into an ACTIVE rental,
 * who had never requested a return, saw "Scooter Returned Successfully" on
 * My Scooter — showing another rider's ₹2000 deposit and ₹3000 damage fee.
 * A cross-tenant leak of financial data, not just a wrong card.
 *
 * The failure was invisible from the response, which is why it survived
 * review: toSettlementRow reads the nulled embed as `user_id: ""`, and
 * nothing rendered that field.
 */

let handler: QueryHandler = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q));
const fakeRef = { current: fake as unknown as Record<string, unknown> };

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

const { getMySettlement } = await import("../src/modules/returns/returns.service");

const RIDER = "rider-1";
const OTHER_RIDER = "rider-2";

/** A settled, fully-resolved settlement row as PostgREST would return it. */
function settlementRow(ownerId: string) {
    return {
        rental_id: "rental-9",
        settled_at: "2026-08-26T10:02:16.304Z",
        deposit_amount_snapshot: 2000,
        late_fee_amount: 0,
        damage_amount: 3000,
        other_charges_amount: 0,
        total_charges_amount: 3000,
        net_amount: -1000,
        outcome: "amount_due",
        refund_id: null,
        invoice_id: null,
        created_at: "2026-08-26T10:02:16.304Z",
        settled_by: null,
        rentals: { user_id: ownerId, subscriptions: { booking_id: "booking-9" } },
        refunds: null,
    };
}

/**
 * @param owner who the newest settlement in the table belongs to
 * @param respectFilter whether the fake honours the ownership filter, i.e.
 *        whether the embed is inner. False reproduces the live behaviour of
 *        the broken query.
 */
function build(owner: string, respectFilter: boolean) {
    handler = (q) => {
        // No in-progress return for this rider (getMyPendingSettlement).
        if (q.table === "rental_returns") return { data: null };

        if (q.table === "rental_settlements") {
            const wanted = q.filters.find((f) => f[1] === "rentals.user_id")?.[2];
            if (respectFilter && wanted !== owner) return { data: null };
            return { data: settlementRow(owner) };
        }

        return { data: null };
    };
}

beforeEach(() => {
    fake = createFakeSupabase((q) => handler(q));
    fakeRef.current = fake as unknown as Record<string, unknown>;
});

describe("getMySettlement", () => {
    it("returns the rider's own settlement", async () => {
        build(RIDER, true);

        const settlement = await getMySettlement(RIDER);

        expect(settlement?.user_id).toBe(RIDER);
        expect(settlement?.damage_fee_amount).toBe(3000);
    });

    it("returns null when the newest settlement belongs to someone else", async () => {
        // The fake deliberately IGNORES the ownership filter here, which is
        // exactly what PostgREST did with the non-inner embed. The service
        // must not hand the row over regardless.
        build(OTHER_RIDER, false);

        expect(await getMySettlement(RIDER)).toBeNull();
    });

    it("filters ownership through an INNER embed, so the filter reaches the parent row", async () => {
        build(RIDER, true);

        await getMySettlement(RIDER);

        const query = fake.on("rental_settlements")[0];
        expect(query?.filters).toContainEqual(["eq", "rentals.user_id", RIDER]);
        // `rentals(` alone would filter the embed and return every rider's
        // settlements — see this file's header.
        expect(query?.select).toContain("rentals!inner(");
    });
});
