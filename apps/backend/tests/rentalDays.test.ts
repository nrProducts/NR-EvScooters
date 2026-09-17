import { describe, expect, it } from "vitest";
import { sumRentalDays } from "../src/modules/rentals/rentalDays";

const asOf = new Date("2026-03-01T10:00:00+05:30");

describe("sumRentalDays", () => {
    it("counts the pickup day, so same-day pickup and return is one day, not zero", () => {
        expect(sumRentalDays(
            [{ picked_up_at: "2026-01-05T09:00:00+05:30", returned_at: "2026-01-05T18:00:00+05:30" }],
            asOf,
        )).toBe(1);
    });

    it("counts both ends of a closed rental (1st to 10th is 10 days)", () => {
        expect(sumRentalDays(
            [{ picked_up_at: "2026-01-01T09:00:00+05:30", returned_at: "2026-01-10T09:00:00+05:30" }],
            asOf,
        )).toBe(10);
    });

    it("sums across separate rentals — the threshold is a fact about the rider, not one booking", () => {
        // 20 days, then 25 days: the second deposit reaches 45 cumulative
        // partway through, which is the whole point of counting this way.
        expect(sumRentalDays(
            [
                { picked_up_at: "2026-01-01T09:00:00+05:30", returned_at: "2026-01-20T09:00:00+05:30" },
                { picked_up_at: "2026-02-01T09:00:00+05:30", returned_at: "2026-02-25T09:00:00+05:30" },
            ],
            asOf,
        )).toBe(45);
    });

    it("counts an open rental up to asOf rather than treating it as zero", () => {
        expect(sumRentalDays(
            [{ picked_up_at: "2026-02-20T09:00:00+05:30", returned_at: null }],
            asOf,
        )).toBe(10);
    });

    it("is zero for a rider who has never picked up a scooter", () => {
        expect(sumRentalDays([], asOf)).toBe(0);
    });

    it("ignores a rental that starts after asOf instead of subtracting days", () => {
        expect(sumRentalDays(
            [{ picked_up_at: "2026-06-01T09:00:00+05:30", returned_at: null }],
            asOf,
        )).toBe(0);
    });
});
