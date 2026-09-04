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

const rental = (
    vehicle_id: string, started_at: string, released_at: string | null = null,
): RiderRental => ({ vehicle_id, started_at, released_at });

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

    it("is order-independent — the same windows serialise the same way", () => {
        const ascending = buildOwnershipScope([
            rental(V1, "2026-08-01T10:00:00.000Z", "2026-08-20T10:00:00.000Z"),
            rental(V1, "2026-09-01T10:00:00.000Z"),
        ]);
        const descending = buildOwnershipScope([
            rental(V1, "2026-09-01T10:00:00.000Z"),
            rental(V1, "2026-08-01T10:00:00.000Z", "2026-08-20T10:00:00.000Z"),
        ]);
        expect(ascending).toBe(descending);
    });

    it("de-duplicates identical assignment windows", () => {
        const scope = buildOwnershipScope([
            rental(V1, "2026-08-01T10:00:00.000Z"),
            rental(V1, "2026-08-01T10:00:00.000Z"),
        ]);
        expect(scope).toBe(`and(vehicle_id.eq.${V1},created_at.gte.2026-08-01T10:00:00.000Z)`);
    });

    /**
     * The leak this file exists to stop, in its remaining form.
     *
     * The scope used to be a lower bound only, collapsed to the EARLIEST
     * pickup per vehicle. Two consequences, both live:
     *
     *   · a rider who handed a scooter back kept seeing every ticket raised on
     *     it afterwards, forever — the next rider's damage reports included;
     *   · holding the same unit twice collapsed into one span from the first
     *     pickup, handing the rider the gap in between, when someone else had
     *     it.
     *
     * Each assignment is now its own bounded window.
     */
    describe("released vehicles", () => {
        it("closes the window at release, so a later ticket is out of scope", () => {
            const scope = buildOwnershipScope([
                rental(V1, "2026-08-01T10:00:00.000Z", "2026-08-20T10:00:00.000Z"),
            ]);
            expect(scope).toContain(`vehicle_id.eq.${V1}`);
            expect(scope).toContain("created_at.gte.2026-08-01T10:00:00.000Z");
            expect(scope).toContain("created_at.lte.");
        });

        it("leaves a still-held vehicle open-ended", () => {
            const scope = buildOwnershipScope([rental(V1, "2026-08-01T10:00:00.000Z")]);
            expect(scope).toBe(`and(vehicle_id.eq.${V1},created_at.gte.2026-08-01T10:00:00.000Z)`);
            expect(scope).not.toContain("lte");
        });

        it("keeps two rentals of the SAME unit as two windows, not one span", () => {
            // Between the 20th and the 1st someone else had this scooter. One
            // collapsed clause from the earliest pickup would cover that gap.
            const scope = buildOwnershipScope([
                rental(V1, "2026-08-01T10:00:00.000Z", "2026-08-20T10:00:00.000Z"),
                rental(V1, "2026-09-01T10:00:00.000Z"),
            ]);
            expect(scope?.split("),and(")).toHaveLength(2);
        });

        it("grants a grace window past release, so a handover ticket still shows", () => {
            // moveRideToMaintenance releases the assignment AND opens the
            // ticket in that order, so a hard ceiling at released_at races the
            // write and hides the damage the rider themselves just handed in.
            const releasedAt = "2026-08-20T10:00:00.000Z";
            const scope = buildOwnershipScope([rental(V1, "2026-08-01T10:00:00.000Z", releasedAt)]);
            const ceiling = scope?.match(/created_at\.lte\.([^),]+)/)?.[1];
            expect(ceiling).toBeDefined();
            expect(new Date(ceiling!).getTime()).toBeGreaterThan(new Date(releasedAt).getTime());
        });
    });
});
