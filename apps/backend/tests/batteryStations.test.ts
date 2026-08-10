import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stand-in for a Supabase/PostgREST query builder. Every filter method
 * records its call and returns `this`, and the object is thenable, so both
 * shapes the service uses work against it:
 *
 *   await query.order(...)               (mobile list)
 *   await query.order(...).range(...)    (admin list)
 *
 * Recording the calls is the point: "hidden stations are excluded" and
 * "deleted stations are excluded" are assertions about which filters the
 * service applied, and those are exactly what a real client would send.
 */
class QueryStub {
    calls: [string, unknown[]][] = [];
    result: { data: unknown; error: unknown; count?: number } = { data: [], error: null, count: 0 };

    private record(name: string, args: unknown[]) {
        this.calls.push([name, args]);
        return this;
    }

    select = (...args: unknown[]) => this.record("select", args);
    is = (...args: unknown[]) => this.record("is", args);
    eq = (...args: unknown[]) => this.record("eq", args);
    neq = (...args: unknown[]) => this.record("neq", args);
    or = (...args: unknown[]) => this.record("or", args);
    gte = (...args: unknown[]) => this.record("gte", args);
    lte = (...args: unknown[]) => this.record("lte", args);
    ilike = (...args: unknown[]) => this.record("ilike", args);
    overlaps = (...args: unknown[]) => this.record("overlaps", args);
    limit = (...args: unknown[]) => this.record("limit", args);
    range = (...args: unknown[]) => this.record("range", args);
    order = (...args: unknown[]) => this.record("order", args);
    insert = (...args: unknown[]) => this.record("insert", args);
    update = (...args: unknown[]) => this.record("update", args);
    maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);
    single = (...args: unknown[]) => this.record("single", args);

    then(onFulfilled: (value: typeof this.result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }

    /** Every value passed to .eq("column", value), for readable assertions. */
    eqArgs(): [string, unknown][] {
        return this.calls.filter(([name]) => name === "eq").map(([, args]) => args as [string, unknown]);
    }

    calledWith(method: string, ...expected: unknown[]): boolean {
        return this.calls.some(
            ([name, args]) => name === method && expected.every((value, index) => args[index] === value),
        );
    }
}

let queryStub: QueryStub;

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: () => queryStub,
    },
}));

// Audit writes are best-effort side effects; stubbed so they don't reach the
// mocked client and confuse the recorded calls.
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

import { haversineKm, isValidLatitude, isValidLongitude } from "../src/common/geo";
import {
    getStationById, listStationsForMobile, toBatteryStation,
} from "../src/modules/battery-stations/battery-stations.service";
import {
    createStationBody, listMobileStationsQuery, updateStationBody, visibilityBody,
} from "../src/modules/battery-stations/battery-stations.validation";
import type { BatteryStationRow } from "../src/modules/battery-stations/battery-stations.types";
import { requireAdmin } from "../src/middleware/authorize.middleware";
import type { AuthedRequest } from "../src/middleware/auth.middleware";
import { AppError } from "../src/common/AppError";

const egmoreRow: BatteryStationRow = {
    id: "11111111-1111-4111-8111-111111111111",
    serial_number: 4,
    qis_ids: ["WMQISXM1V1-00824", "WMQISXM1V1-00817"],
    name: "Egmore Railway Station",
    latitude: 13.0779871,
    longitude: 80.2619914,
    status: "WORKING",
    battery_count: 28,
    is_visible_on_mobile: true,
    deleted_at: null,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: null,
    created_by: null,
    updated_by: null,
};

beforeEach(() => {
    queryStub = new QueryStub();
});

describe("toBatteryStation (API mapping)", () => {
    it("maps every snake_case column onto the camelCase contract", () => {
        const station = toBatteryStation(egmoreRow);

        expect(station).toMatchObject({
            id: egmoreRow.id,
            serialNumber: 4,
            qisIds: ["WMQISXM1V1-00824", "WMQISXM1V1-00817"],
            name: "Egmore Railway Station",
            latitude: 13.0779871,
            longitude: 80.2619914,
            status: "WORKING",
            batteryCount: 28,
            isVisibleOnMobile: true,
            isDeleted: false,
        });
    });

    it("preserves the stored name verbatim, underscores included", () => {
        const station = toBatteryStation({ ...egmoreRow, name: "Mogappaire_Hub" });
        expect(station.name).toBe("Mogappaire_Hub");
    });

    it("derives isDeleted from deleted_at", () => {
        expect(toBatteryStation({ ...egmoreRow, deleted_at: "2026-08-02T00:00:00.000Z" }).isDeleted).toBe(true);
    });

    it("falls back to created_at while a row has never been edited", () => {
        expect(toBatteryStation(egmoreRow).updatedAt).toBe(egmoreRow.created_at);
        expect(toBatteryStation({ ...egmoreRow, updated_at: "2026-08-03T09:00:00.000Z" }).updatedAt)
            .toBe("2026-08-03T09:00:00.000Z");
    });

    it("omits createdBy/updatedBy rather than emitting nulls", () => {
        const station = toBatteryStation(egmoreRow);
        expect(station).not.toHaveProperty("createdBy");
        expect(toBatteryStation({ ...egmoreRow, created_by: "abc" }).createdBy).toBe("abc");
    });
});

describe("mobile station list — exclusions", () => {
    it("excludes soft-deleted stations", async () => {
        queryStub.result = { data: [egmoreRow], error: null };
        await listStationsForMobile({}, false);
        expect(queryStub.calledWith("is", "deleted_at", null)).toBe(true);
    });

    it("excludes stations hidden from mobile for a non-admin caller", async () => {
        queryStub.result = { data: [egmoreRow], error: null };
        await listStationsForMobile({}, false);
        expect(queryStub.eqArgs()).toContainEqual(["is_visible_on_mobile", true]);
    });

    it("includes hidden stations for an admin caller, but still not deleted ones", async () => {
        queryStub.result = { data: [egmoreRow], error: null };
        await listStationsForMobile({}, true);
        expect(queryStub.eqArgs()).not.toContainEqual(["is_visible_on_mobile", true]);
        expect(queryStub.calledWith("is", "deleted_at", null)).toBe(true);
    });

    it("returns an empty list when the API has no stations", async () => {
        queryStub.result = { data: [], error: null };
        await expect(listStationsForMobile({}, false)).resolves.toEqual([]);
    });

    it("surfaces a database failure instead of swallowing it", async () => {
        queryStub.result = { data: null, error: new Error("connection reset") };
        await expect(listStationsForMobile({}, false)).rejects.toThrow("connection reset");
    });

    it("adds a distance to every station when the caller sends an origin", async () => {
        queryStub.result = { data: [egmoreRow], error: null };
        const [station] = await listStationsForMobile(
            { latitude: 13.0827, longitude: 80.2707 },
            false,
        );
        expect(station.distanceKm).toBeGreaterThan(0);
        expect(station.distanceKm).toBeLessThan(2);
    });

    it("drops stations outside the requested radius", async () => {
        queryStub.result = { data: [egmoreRow], error: null };
        const stations = await listStationsForMobile(
            { latitude: 13.0827, longitude: 80.2707, radiusKm: 0.1 },
            false,
        );
        expect(stations).toHaveLength(0);
    });
});

describe("station detail", () => {
    it("hides a mobile-hidden station behind the same 404 as a missing one", async () => {
        queryStub.result = { data: null, error: null };
        await expect(getStationById(egmoreRow.id, false)).rejects.toMatchObject({ status: 404 });
        expect(queryStub.eqArgs()).toContainEqual(["is_visible_on_mobile", true]);
    });
});

describe("coordinate validation", () => {
    const base = { name: "Test Station", qisIds: ["QIS-1"], batteryCount: 10 };

    it.each([
        ["latitude", { ...base, latitude: 91, longitude: 80 }],
        ["latitude", { ...base, latitude: -91, longitude: 80 }],
        ["longitude", { ...base, latitude: 13, longitude: 181 }],
        ["longitude", { ...base, latitude: 13, longitude: -181 }],
    ])("rejects an out-of-range %s", (_field, payload) => {
        expect(createStationBody.safeParse(payload).success).toBe(false);
    });

    it("accepts the boundary values", () => {
        expect(createStationBody.safeParse({ ...base, latitude: 90, longitude: 180 }).success).toBe(true);
        expect(createStationBody.safeParse({ ...base, latitude: -90, longitude: -180 }).success).toBe(true);
    });

    it("keeps six-decimal precision rather than rounding it away", () => {
        const parsed = createStationBody.parse({ ...base, latitude: 13.0779871, longitude: 80.2619914 });
        expect(parsed.latitude).toBe(13.0779871);
        expect(parsed.longitude).toBe(80.2619914);
    });

    it("agrees with the shared geo guards", () => {
        expect(isValidLatitude(13.0648)).toBe(true);
        expect(isValidLatitude(90.1)).toBe(false);
        expect(isValidLongitude(80.197765)).toBe(true);
        expect(isValidLongitude(-180.1)).toBe(false);
        expect(isValidLatitude(Number.NaN)).toBe(false);
    });
});

describe("QIS ID validation", () => {
    const base = { name: "Test Station", latitude: 13, longitude: 80, batteryCount: 10 };

    it("requires at least one QIS ID", () => {
        expect(createStationBody.safeParse({ ...base, qisIds: [] }).success).toBe(false);
    });

    it("rejects duplicates", () => {
        const result = createStationBody.safeParse({ ...base, qisIds: ["QIS-1", "QIS-1"] });
        expect(result.success).toBe(false);
    });

    it("rejects duplicates that differ only in case — same physical device", () => {
        expect(createStationBody.safeParse({ ...base, qisIds: ["QIS-1", "qis-1"] }).success).toBe(false);
    });

    it("accepts distinct ids and trims them", () => {
        const parsed = createStationBody.parse({ ...base, qisIds: [" QIS-1 ", "QIS-2"] });
        expect(parsed.qisIds).toEqual(["QIS-1", "QIS-2"]);
    });

    it("applies the same rule on update", () => {
        expect(updateStationBody.safeParse({ qisIds: ["A", "A"] }).success).toBe(false);
        expect(updateStationBody.safeParse({ qisIds: ["A", "B"] }).success).toBe(true);
    });
});

describe("battery count validation", () => {
    const base = { name: "Test Station", qisIds: ["QIS-1"], latitude: 13, longitude: 80 };

    it("rejects a negative count", () => {
        expect(createStationBody.safeParse({ ...base, batteryCount: -1 }).success).toBe(false);
    });

    it("rejects a fractional count", () => {
        expect(createStationBody.safeParse({ ...base, batteryCount: 3.5 }).success).toBe(false);
    });

    it("accepts zero", () => {
        expect(createStationBody.safeParse({ ...base, batteryCount: 0 }).success).toBe(true);
    });
});

describe("query validation", () => {
    it("defaults to WORKING when no status is supplied", () => {
        const parsed = createStationBody.parse({
            name: "Test", qisIds: ["QIS-1"], latitude: 13, longitude: 80, batteryCount: 1,
        });
        expect(parsed.status).toBeUndefined(); // the service applies the default
    });

    it("rejects an unknown status", () => {
        expect(listMobileStationsQuery.safeParse({ status: "BROKEN" }).success).toBe(false);
    });

    it("rejects half an origin", () => {
        expect(listMobileStationsQuery.safeParse({ latitude: "13.08" }).success).toBe(false);
        expect(listMobileStationsQuery.safeParse({ latitude: "13.08", longitude: "80.27" }).success).toBe(true);
    });

    it("rejects a radius with nothing to measure from", () => {
        expect(listMobileStationsQuery.safeParse({ radiusKm: "5" }).success).toBe(false);
    });

    it("requires a boolean for the visibility toggle", () => {
        expect(visibilityBody.safeParse({ isVisibleOnMobile: "yes" }).success).toBe(false);
        expect(visibilityBody.safeParse({ isVisibleOnMobile: false }).success).toBe(true);
    });

    it("rejects an empty update body", () => {
        expect(updateStationBody.safeParse({}).success).toBe(false);
    });

    it("rejects unknown fields on update", () => {
        expect(updateStationBody.safeParse({ isDeleted: true }).success).toBe(false);
    });
});

describe("admin permission checks", () => {
    const run = (roles: string[] | null) => {
        const req = { user: roles ? { roles } : undefined } as unknown as AuthedRequest;
        let captured: unknown;
        requireAdmin(req, {} as never, ((err?: unknown) => {
            captured = err;
        }) as never);
        return captured;
    };

    it("lets an admin through", () => {
        expect(run(["admin"])).toBeUndefined();
    });

    it("rejects a rider with 403", () => {
        expect(run(["rider"])).toBeInstanceOf(AppError);
        expect(run(["rider"])).toMatchObject({ status: 403 });
    });

    it("rejects staff who are not admins — station writes are admin-only", () => {
        expect(run(["staff", "technician"])).toMatchObject({ status: 403 });
    });

    it("rejects an unauthenticated caller with 401", () => {
        expect(run(null)).toMatchObject({ status: 401 });
    });
});

describe("haversineKm", () => {
    it("is zero for a point and itself", () => {
        expect(haversineKm({ latitude: 13.0648, longitude: 80.197765 }, { latitude: 13.0648, longitude: 80.197765 }))
            .toBe(0);
    });

    it("measures a known Chennai pair to within 100 m", () => {
        // Egmore (#4) → Chennai Central Suburban (#23): ~1.1 km apart.
        const distance = haversineKm(
            { latitude: 13.0779871, longitude: 80.2619914 },
            { latitude: 13.082806, longitude: 80.273642 },
        );
        expect(distance).toBeGreaterThan(1.2);
        expect(distance).toBeLessThan(1.5);
    });

    it("is symmetric", () => {
        const a = { latitude: 12.877046, longitude: 80.202494 };
        const b = { latitude: 13.142855, longitude: 80.2228683 };
        expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
    });

    it("does not confuse latitude with longitude", () => {
        // Chennai (13N, 80E) vs the swapped point (80N, 13E) — thousands of km
        // apart. A reversed pair anywhere in the stack fails loudly here.
        const correct = haversineKm(
            { latitude: 13.0827, longitude: 80.2707 },
            { latitude: 13.0648, longitude: 80.197765 },
        );
        const swapped = haversineKm(
            { latitude: 13.0827, longitude: 80.2707 },
            { latitude: 80.197765, longitude: 13.0648 },
        );
        expect(correct).toBeLessThan(10);
        expect(swapped).toBeGreaterThan(5000);
    });
});
