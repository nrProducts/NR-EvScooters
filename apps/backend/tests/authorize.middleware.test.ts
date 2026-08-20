import { describe, expect, it } from "vitest";
import { resolveAccess } from "../src/middleware/authorize.middleware";

/**
 * `resolveModuleAccess(roles[], hasGrant)` is `resolveAccess(role, hasGrant)`.
 *
 * Both arguments changed shape with the schema. The role is a single value off
 * `users.role` rather than an array off `user_roles`, and `technician` and
 * `station_manager` are gone — they were role names with no distinct grants
 * behind them, so the case that used to assert "these two behave like staff"
 * has nothing left to assert.
 */
describe("resolveAccess", () => {
    it("always allows admin, regardless of any grant", () => {
        expect(resolveAccess("admin", false)).toBe(true);
        expect(resolveAccess("admin", true)).toBe(true);
    });

    it("denies a rider even with a (nonsensical) grant", () => {
        expect(resolveAccess("rider", true)).toBe(false);
        expect(resolveAccess("rider", false)).toBe(false);
    });

    it("allows staff only when a grant is present", () => {
        expect(resolveAccess("staff", true)).toBe(true);
        expect(resolveAccess("staff", false)).toBe(false);
    });
});
