import { describe, expect, it } from "vitest";
import { resolveModuleAccess } from "../src/middleware/authorize.middleware";

describe("resolveModuleAccess", () => {
    it("always allows admin, regardless of any grant", () => {
        expect(resolveModuleAccess(["admin"], false)).toBe(true);
        expect(resolveModuleAccess(["admin"], true)).toBe(true);
    });

    it("denies a rider even with a (nonsensical) grant", () => {
        expect(resolveModuleAccess(["rider"], true)).toBe(false);
        expect(resolveModuleAccess(["rider"], false)).toBe(false);
    });

    it("allows staff only when a grant is present", () => {
        expect(resolveModuleAccess(["staff"], true)).toBe(true);
        expect(resolveModuleAccess(["staff"], false)).toBe(false);
    });

    it("treats technician/station_manager the same as staff", () => {
        expect(resolveModuleAccess(["technician"], true)).toBe(true);
        expect(resolveModuleAccess(["station_manager"], true)).toBe(true);
        expect(resolveModuleAccess(["technician"], false)).toBe(false);
    });
});
