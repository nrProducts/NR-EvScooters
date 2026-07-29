import { describe, expect, it } from "vitest";
import {
    RawModelRow, toAvailability, toListItem, toPlans,
} from "../src/modules/vehicle-catalog/vehicle-catalog.service";

describe("toPlans", () => {
    it("sorts by billing cycle in daily/weekly/monthly/yearly order regardless of input order", () => {
        const plans = toPlans([
            { id: "y", billing_cycle: "yearly", price: 24999, included_minutes: null },
            { id: "d", billing_cycle: "daily", price: 149, included_minutes: 120 },
            { id: "m", billing_cycle: "monthly", price: 2499, included_minutes: 4000 },
            { id: "w", billing_cycle: "weekly", price: 799, included_minutes: 900 },
        ]);
        expect(plans.map((p) => p.billing_cycle)).toEqual(["daily", "weekly", "monthly", "yearly"]);
    });

    it("coerces price to a number", () => {
        const [plan] = toPlans([{ id: "d", billing_cycle: "daily", price: "149.00" as unknown as number, included_minutes: null }]);
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
        vendors: { id: "vendor-1", name: "NR Mobility Partners", description: null, logo_url: null },
        image: "https://cdn.example.com/models/hero.png",
        plans: [
            { billing_cycle: "monthly", price: 2499 },
            { billing_cycle: "daily", price: 149 },
        ],
    };

    it("exposes vehicle_models.image as image_url", () => {
        expect(toListItem(baseRow).image_url).toBe("https://cdn.example.com/models/hero.png");
    });

    it("reports null image_url when the model has no artwork", () => {
        expect(toListItem({ ...baseRow, image: null }).image_url).toBeNull();
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
