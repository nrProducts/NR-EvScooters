import { describe, expect, it } from "vitest";
import { buildOwnershipScope, type RiderRental } from "../src/modules/maintenance/maintenance.service";

/**
 * buildOwnershipScope is the ENTIRE access check for GET /maintenance/me/history.
 * That endpoint queries as supabaseAdmin, so the vehicle_maintenance_admin_only
 * RLS policy is bypassed and this string is the only thing keeping one rider's
 * staff-authored incident descriptions away from another rider.
 *
 * Before this scoping existed the endpoint returned every ticket on every
 * vehicle the rider had ever rented, with no date window at all.
 */

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

const rental = (vehicle_id: string, started_at: string): RiderRental => ({ vehicle_id, started_at });

describe("buildOwnershipScope", () => {
    it("returns null when the rider has never rented anything", () => {
        expect(buildOwnershipScope([])).toBeNull();
    });

    it("null must mean NO RESULTS, never an unfiltered query", () => {
        // Guards the caller's contract: an empty string passed to .or() would
        // match every row in vehicle_maintenance and leak the whole table.
        expect(buildOwnershipScope([])).not.toBe("");
    });

    it("scopes a single rental to that vehicle from its pickup instant", () => {
        const scope = buildOwnershipScope([rental(V1, "2026-08-01T10:00:00.000Z")]);
        expect(scope).toBe(`and(vehicle_id.eq.${V1},created_at.gte.2026-08-01T10:00:00.000Z)`);
    });

    it("emits one clause per distinct vehicle", () => {
        const scope = buildOwnershipScope([
            rental(V1, "2026-08-01T10:00:00.000Z"),
            rental(V2, "2026-09-01T10:00:00.000Z"),
        ]);
        expect(scope).toContain(`and(vehicle_id.eq.${V1},created_at.gte.2026-08-01T10:00:00.000Z)`);
        expect(scope).toContain(`and(vehicle_id.eq.${V2},created_at.gte.2026-09-01T10:00:00.000Z)`);
        expect(scope?.split("),and(")).toHaveLength(2);
    });

    it("uses the EARLIEST pickup when the same unit was rented twice", () => {
        const scope = buildOwnershipScope([
            rental(V1, "2026-09-01T10:00:00.000Z"),
            rental(V1, "2026-08-01T10:00:00.000Z"),
        ]);
        expect(scope).toBe(`and(vehicle_id.eq.${V1},created_at.gte.2026-08-01T10:00:00.000Z)`);
    });

    it("is order-independent — a later-listed earlier rental still wins", () => {
        const ascending = buildOwnershipScope([
            rental(V1, "2026-08-01T10:00:00.000Z"),
            rental(V1, "2026-09-01T10:00:00.000Z"),
        ]);
        const descending = buildOwnershipScope([
            rental(V1, "2026-09-01T10:00:00.000Z"),
            rental(V1, "2026-08-01T10:00:00.000Z"),
        ]);
        expect(ascending).toBe(descending);
    });

    it("collapses repeat rentals to one clause per vehicle, not one per rental", () => {
        const scope = buildOwnershipScope([
            rental(V1, "2026-08-01T10:00:00.000Z"),
            rental(V1, "2026-09-01T10:00:00.000Z"),
            rental(V2, "2026-10-01T10:00:00.000Z"),
        ]);
        expect(scope?.split("),and(")).toHaveLength(2);
    });

    it("bounds below only — no ceiling that could hide a ticket opened at return", () => {
        // moveRideToMaintenance ends the rental AND opens the ticket in one
        // flow; an ended_at upper bound would race that write and hide the
        // rider's own damage report.
        const scope = buildOwnershipScope([rental(V1, "2026-08-01T10:00:00.000Z")]);
        expect(scope).not.toContain("lte");
        expect(scope).not.toContain("lt.");
    });
});
