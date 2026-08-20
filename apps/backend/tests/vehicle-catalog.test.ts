import { describe, expect, it } from "vitest";
import {
    RawModelRow, toAvailability, toListItem, toPlans,
} from "../src/modules/vehicle-catalog/vehicle-catalog.service";

/*
 * The ROWS these take are `plans` rows: `billing_period` and `price_amount`,
 * not `billing_cycle` and `price`. The wire shape still says billing_cycle —
 * `toPlans` is the thing that renames them — so the assertions below are
 * unchanged; only the input is.
 *
 * `included_minutes` is gone from the input entirely: no column backs it, the
 * plans are unlimited-use subscriptions, and nothing ever wrote it. It stays
 * on the wire as a constant null so neither app breaks.
 */
describe("toPlans", () => {
    it("sorts by billing cycle in daily/weekly/monthly/yearly order regardless of input order", () => {
        const plans = toPlans([
            { id: "y", billing_period: "yearly", price_amount: 24999 },
            { id: "d", billing_period: "daily", price_amount: 149 },
            { id: "m", billing_period: "monthly", price_amount: 2499 },
            { id: "w", billing_period: "weekly", price_amount: 799 },
        ]);
        expect(plans.map((p) => p.billing_cycle)).toEqual(["daily", "weekly", "monthly", "yearly"]);
    });

    it("coerces price to a number", () => {
        const [plan] = toPlans([
            { id: "d", billing_period: "daily", price_amount: "149.00" as unknown as number },
        ]);
        expect(plan.price).toBe(149);
    });

    it("returns an empty array for null/non-array input", () => {
        expect(toPlans(null)).toEqual([]);
    });
});

describe("toAvailability", () => {
    it("is available when at least one unit is free", () => {
        expect(toAvailability(1)).toEqual({ available_count: 1, status: "available" });
        expect(toAvailability(4)).toEqual({ available_count: 4, status: "available" });
    });

    it("is unavailable when the count is zero", () => {
        expect(toAvailability(0)).toEqual({ available_count: 0, status: "unavailable" });
    });
});

describe("toListItem", () => {
    const baseRow: RawModelRow = {
        id: "model-1",
        name: "NR Volt X1",
        category: "scooter",
        tagline: "Ride further, charge faster",
        battery_range_km: 151,
        top_speed_kmph: 90,
        charging_time_hours: 3.5,
        is_featured: true,
        // `vendors.logo_url` is `logo_storage_path` — a path in a private
        // bucket, not a URL. The wire field keeps its name; the rename happens
        // in toVendorSummary.
        vendors: {
            id: "vendor-1", name: "NR Mobility Partners",
            description: null, logo_storage_path: null,
        },
        // `vehicle_models.image` became `vehicle_model_media` rows — a model
        // has several images with a primary flag and a sort order, rather than
        // one column holding whichever was uploaded last.
        vehicle_model_media: [
            { storage_path: "models/hero.png", is_primary: true, sort_order: 1 },
            { storage_path: "models/side.png", is_primary: false, sort_order: 0 },
        ],
        plans: [
            { billing_period: "monthly", price_amount: 2499 },
            { billing_period: "daily", price_amount: 149 },
        ],
    };

    it("picks the primary image, not merely the lowest sort_order", () => {
        expect(toListItem(baseRow).image_url).toBe("models/hero.png");
    });

    it("falls back to the lowest sort_order when none is flagged primary", () => {
        const media = [
            { storage_path: "models/hero.png", is_primary: false, sort_order: 1 },
            { storage_path: "models/side.png", is_primary: false, sort_order: 0 },
        ];
        expect(toListItem({ ...baseRow, vehicle_model_media: media }).image_url)
            .toBe("models/side.png");
    });

    it("reports null image_url when the model has no artwork", () => {
        expect(toListItem({ ...baseRow, vehicle_model_media: [] }).image_url).toBeNull();
    });

    it("computes starting_price as the minimum plan price", () => {
        expect(toListItem(baseRow).starting_price).toBe(149);
    });

    it("reports null starting_price when there are no plans", () => {
        expect(toListItem({ ...baseRow, plans: [] }).starting_price).toBeNull();
    });

    it("unwraps a single-element vendors array (PostgREST array-of-one shape)", () => {
        const row: RawModelRow = { ...baseRow, vendors: [baseRow.vendors] };
        expect(toListItem(row).vendor).toEqual({
            id: "vendor-1", name: "NR Mobility Partners", description: null, logo_url: null,
        });
    });

    it("returns a null vendor when none is joined", () => {
        expect(toListItem({ ...baseRow, vendors: null }).vendor).toBeNull();
    });
});
