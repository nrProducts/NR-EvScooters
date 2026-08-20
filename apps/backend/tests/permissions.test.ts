import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    hasModuleAccess, hasPermission, isStaffRole, permissionKey,
    STAFF_ROLES, USER_ROLES,
} from "../src/types";
import type { AuthContext, PermissionKey } from "../src/types";

/**
 * This replaces capability.test.ts.
 *
 * Capabilities are gone. `kyc_reviewer`, `rights_officer` and `pii_exporter`
 * were a second authorisation axis alongside modules — which sections you may
 * open, versus whether you may see raw personal data inside them — with their
 * own enum, their own middleware and their own admin screen. They are ordinary
 * permissions now: `kyc.reveal_number`, `privacy.process`, `privacy.export`.
 *
 * The property the old tests were really defending survives, and is asserted
 * below: **a role is not a substitute for a grant.** That was the whole point
 * of the split, and it still holds — an ops agent with the KYC module cannot
 * reveal a document number unless someone granted them that permission.
 *
 * The one behaviour that genuinely changed: admin is now unconditional.
 * `resolveAccess` and `v_user_effective_permissions` both give admin
 * everything without enumerating it, so admin holds an empty permission set
 * and the checks below short-circuit before consulting it.
 */

const MIGRATIONS = join(__dirname, "../../../supabase/v2/migrations");

function actor(role: AuthContext["role"], keys: PermissionKey[] = []): AuthContext {
    return {
        id: "11111111-1111-1111-1111-111111111111",
        role,
        permissions: new Set(keys),
        status: "active",
        kycStatus: "verified",
        isDeleted: false,
    };
}

describe("hasPermission", () => {
    it("is false for a staff member who was not granted it", () => {
        expect(hasPermission(actor("staff"), "kyc", "reveal_number")).toBe(false);
    });

    it("is true only for the exact permission granted", () => {
        const staff = actor("staff", [permissionKey("privacy", "process")]);
        expect(hasPermission(staff, "privacy", "process")).toBe(true);
        expect(hasPermission(staff, "privacy", "export")).toBe(false);
        expect(hasPermission(staff, "kyc", "reveal_number")).toBe(false);
    });

    // The successor to "does not let the admin role stand in for a
    // capability". Holding kyc.view — being able to open the queue at all —
    // must not carry the right to unmask an identity number with it.
    it("does not let opening a module stand in for acting inside it", () => {
        const reviewer = actor("staff", [permissionKey("kyc", "view")]);
        expect(hasModuleAccess(reviewer, "kyc")).toBe(true);
        expect(hasPermission(reviewer, "kyc", "reveal_number")).toBe(false);
    });
});

describe("hasModuleAccess", () => {
    it("is true when any permission in the module is held", () => {
        const staff = actor("staff", [permissionKey("vehicles", "edit")]);
        expect(hasModuleAccess(staff, "vehicles")).toBe(true);
        expect(hasModuleAccess(staff, "users")).toBe(false);
    });

    // A prefix scan must not match a module whose key merely starts the same.
    it("does not match a module by prefix alone", () => {
        const staff = actor("staff", ["pii_access_log.view" as PermissionKey]);
        expect(hasModuleAccess(staff, "pii_access_log")).toBe(true);
        expect(hasModuleAccess(staff, "pii")).toBe(false);
    });
});

describe("roles match the database", () => {
    const identity = readFileSync(join(MIGRATIONS, "20260819100100_enums.sql"), "utf8");

    it("every USER_ROLES value exists as a user_role label", () => {
        const block = identity.slice(identity.indexOf("create type public.user_role"));
        for (const role of USER_ROLES) {
            expect(block.slice(0, 200), `user_role is missing '${role}'`).toContain(`'${role}'`);
        }
    });

    it("STAFF_ROLES is a subset of USER_ROLES and excludes rider", () => {
        expect(STAFF_ROLES.every((r) => USER_ROLES.includes(r))).toBe(true);
        expect(STAFF_ROLES).not.toContain("rider");
        expect(isStaffRole("rider")).toBe(false);
        expect(isStaffRole("staff")).toBe(true);
        expect(isStaffRole("admin")).toBe(true);
    });
});
