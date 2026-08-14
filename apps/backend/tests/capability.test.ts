import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    hasCapability, requireCapability, requireKycReviewer,
} from "../src/middleware/capability.middleware";
import { ROLE_NAMES, STAFF_CAPABILITIES, STAFF_ROLES } from "../src/types";
import type { AuthedRequest } from "../src/middleware/auth.middleware";
import type { AuthContext } from "../src/types";

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");

function actor(overrides: Partial<AuthContext> = {}): AuthContext {
    return {
        id: "11111111-1111-1111-1111-111111111111",
        roles: ["admin"],
        capabilities: [],
        accountStatus: "active",
        kycStatus: "verified",
        isDeleted: false,
        ...overrides,
    };
}

const reqWith = (user?: AuthContext) => ({ user } as AuthedRequest);
const res = {} as Response;

describe("hasCapability", () => {
    it("is false for an unauthenticated request", () => {
        expect(hasCapability(reqWith(undefined), "kyc_reviewer")).toBe(false);
    });

    it("is false for an admin who has not been granted it", () => {
        expect(hasCapability(reqWith(actor()), "kyc_reviewer")).toBe(false);
    });

    it("is true only for the exact capability granted", () => {
        const req = reqWith(actor({ capabilities: ["rights_officer"] }));
        expect(hasCapability(req, "rights_officer")).toBe(true);
        expect(hasCapability(req, "kyc_reviewer")).toBe(false);
    });
});

describe("requireCapability", () => {
    it("passes the holder through with no error", () => {
        const next = vi.fn();
        requireKycReviewer(reqWith(actor({ capabilities: ["kyc_reviewer"] })), res, next);
        expect(next).toHaveBeenCalledWith();
    });

    it("forbids a staff member without the capability", () => {
        const next = vi.fn();
        requireKycReviewer(reqWith(actor({ roles: ["staff"] })), res, next);
        const err = next.mock.calls[0][0];
        expect(err.status).toBe(403);
        expect(err.message).toContain("kyc_reviewer");
    });

    // Role is not a substitute for capability. This is the whole point of the
    // split: before it, "logged into the admin panel" was the only check
    // standing between an ops agent and every rider's Aadhaar scan.
    it("does not let the admin role stand in for a capability", () => {
        const next = vi.fn();
        requireCapability("pii_exporter")(reqWith(actor({ roles: ["admin"] })), res, next);
        expect(next.mock.calls[0][0].status).toBe(403);
    });

    it("reports unauthenticated rather than forbidden when there is no user", () => {
        const next = vi.fn();
        requireKycReviewer(reqWith(undefined), res, next);
        expect(next.mock.calls[0][0].status).toBe(401);
    });
});

// The backend has coded for staff/technician/station_manager since long before
// they existed in the database, which is exactly the drift that left "admin or
// nothing" as the only real authorisation boundary. Lock the two together.
describe("role and capability enums match the database", () => {
    const enums = readFileSync(join(MIGRATIONS, "20260720100000_extensions_and_enums.sql"), "utf8");
    const dpdpa = readFileSync(join(MIGRATIONS, "20260814100000_dpdpa_enums.sql"), "utf8");

    it("every ROLE_NAMES value exists as a role_name label", () => {
        for (const role of ROLE_NAMES) {
            const seeded = enums.includes(`'${role}'`) && /create type public\.role_name/.test(enums);
            const added = dpdpa.includes(`add value if not exists '${role}'`);
            expect(seeded || added, `role_name is missing '${role}'`).toBe(true);
        }
    });

    it("every STAFF_CAPABILITIES value exists as a staff_capability label", () => {
        const block = dpdpa.slice(dpdpa.indexOf("create type public.staff_capability"));
        for (const cap of STAFF_CAPABILITIES) {
            expect(block, `staff_capability is missing '${cap}'`).toContain(`'${cap}'`);
        }
    });

    it("STAFF_ROLES is a subset of ROLE_NAMES and excludes rider", () => {
        expect(STAFF_ROLES.every((r) => ROLE_NAMES.includes(r))).toBe(true);
        expect(STAFF_ROLES).not.toContain("rider");
    });
});
