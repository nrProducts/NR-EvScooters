import { describe, expect, it } from "vitest";
import { paginate, toRange } from "../src/common/pagination";

describe("toRange", () => {
    it("is zero-indexed and inclusive", () => {
        expect(toRange({ page: 1, pageSize: 20 })).toEqual([0, 19]);
        expect(toRange({ page: 3, pageSize: 20 })).toEqual([40, 59]);
    });
});

describe("paginate", () => {
    it("computes totalPages by rounding up", () => {
        expect(paginate([], 41, { page: 1, pageSize: 20 }).pagination).toEqual({
            page: 1, pageSize: 20, total: 41, totalPages: 3,
        });
    });

    it("reports zero pages for an empty set", () => {
        expect(paginate([], 0, { page: 1, pageSize: 20 }).pagination.totalPages).toBe(0);
    });
});
