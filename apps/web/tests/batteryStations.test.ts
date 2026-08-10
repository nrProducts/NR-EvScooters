import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin console's battery-station rules: form validation, and the exact
 * request each admin action sends. Both are what "admin adds / edits / hides /
 * deletes a station" reduces to on this side of the wire.
 */

const calls: { method: string; path: string; body?: unknown; query?: unknown }[] = [];

vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession: async () => ({ data: {} }) } } }));

vi.mock("@/services/api/httpClient", () => ({
  apiClient: {
    get: async (path: string, query?: unknown) => {
      calls.push({ method: "GET", path, query });
      return { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } };
    },
    post: async (path: string, body?: unknown) => {
      calls.push({ method: "POST", path, body });
      return { id: "new-station" };
    },
    patch: async (path: string, body?: unknown) => {
      calls.push({ method: "PATCH", path, body });
      return { id: "station-1" };
    },
    delete: async (path: string) => {
      calls.push({ method: "DELETE", path });
    },
  },
  toPaginatedResult: (res: { data: unknown[]; pagination: { total: number; page: number; pageSize: number } }) => ({
    data: res.data,
    total: res.pagination.total,
    page: res.pagination.page,
    pageSize: res.pagination.pageSize,
  }),
  ApiError: class ApiError extends Error {},
}));

import * as service from "@/services/api/batteryStations";
import { validateStationForm, type FormState } from "@/components/battery-stations/stationFormValidation";
import { formatStationName } from "@/types/batteryStation";
import { formatCoordinate } from "@/lib/mapConfig";

const validForm: FormState = {
  name: "Egmore Railway Station",
  qisIds: ["WMQISXM1V1-00824", "WMQISXM1V1-00817"],
  latitude: "13.077987",
  longitude: "80.261991",
  status: "WORKING",
  batteryCount: "28",
  isVisibleOnMobile: true,
};

beforeEach(() => {
  calls.length = 0;
});

describe("validateStationForm", () => {
  it("accepts a complete station", () => {
    expect(validateStationForm(validForm)).toEqual({});
  });

  it("requires a station name", () => {
    expect(validateStationForm({ ...validForm, name: "   " }).name).toBeTruthy();
  });

  it("requires at least one QIS ID", () => {
    expect(validateStationForm({ ...validForm, qisIds: [] }).qisIds).toBeTruthy();
  });

  it("rejects duplicate QIS IDs, including case-only differences", () => {
    expect(validateStationForm({ ...validForm, qisIds: ["QIS-1", "QIS-1"] }).qisIds).toBeTruthy();
    expect(validateStationForm({ ...validForm, qisIds: ["QIS-1", "qis-1"] }).qisIds).toBeTruthy();
  });

  it("requires latitude and longitude", () => {
    expect(validateStationForm({ ...validForm, latitude: "" }).latitude).toBeTruthy();
    expect(validateStationForm({ ...validForm, longitude: "" }).longitude).toBeTruthy();
  });

  it("rejects out-of-range coordinates", () => {
    expect(validateStationForm({ ...validForm, latitude: "91" }).latitude).toBeTruthy();
    expect(validateStationForm({ ...validForm, latitude: "-90.5" }).latitude).toBeTruthy();
    expect(validateStationForm({ ...validForm, longitude: "180.1" }).longitude).toBeTruthy();
    expect(validateStationForm({ ...validForm, longitude: "-181" }).longitude).toBeTruthy();
  });

  it("accepts the boundary coordinates", () => {
    expect(validateStationForm({ ...validForm, latitude: "90", longitude: "180" })).toEqual({});
  });

  it("rejects a non-numeric coordinate", () => {
    expect(validateStationForm({ ...validForm, latitude: "thirteen" }).latitude).toBeTruthy();
  });

  it("requires a whole, non-negative battery count", () => {
    expect(validateStationForm({ ...validForm, batteryCount: "-1" }).batteryCount).toBeTruthy();
    expect(validateStationForm({ ...validForm, batteryCount: "3.5" }).batteryCount).toBeTruthy();
    expect(validateStationForm({ ...validForm, batteryCount: "" }).batteryCount).toBeTruthy();
    expect(validateStationForm({ ...validForm, batteryCount: "0" }).batteryCount).toBeUndefined();
  });
});

describe("admin actions", () => {
  it("adds a station with the typed payload", async () => {
    await service.createStation({
      name: "Sembakkam",
      qisIds: ["WMQISXM1V1-02415"],
      latitude: 12.931337,
      longitude: 80.157706,
      status: "WORKING",
      batteryCount: 28,
      isVisibleOnMobile: true,
    });

    expect(calls[0]).toMatchObject({ method: "POST", path: "/admin/battery-stations" });
    expect(calls[0].body).toMatchObject({ latitude: 12.931337, longitude: 80.157706 });
  });

  it("edits coordinates with a partial patch, leaving other fields alone", async () => {
    await service.updateStation("station-1", { latitude: 13.0648, longitude: 80.197765 });

    expect(calls[0]).toEqual({
      method: "PATCH",
      path: "/admin/battery-stations/station-1",
      body: { latitude: 13.0648, longitude: 80.197765 },
    });
  });

  it("hides a station through the dedicated visibility endpoint", async () => {
    await service.updateStationVisibility("station-1", false);

    expect(calls[0]).toEqual({
      method: "PATCH",
      path: "/admin/battery-stations/station-1/visibility",
      body: { isVisibleOnMobile: false },
    });
  });

  it("shows a hidden station again", async () => {
    await service.updateStationVisibility("station-1", true);
    expect(calls[0].body).toEqual({ isVisibleOnMobile: true });
  });

  it("deletes a station", async () => {
    await service.deleteStation("station-1");
    expect(calls[0]).toEqual({ method: "DELETE", path: "/admin/battery-stations/station-1" });
  });
});

describe("admin list filters", () => {
  it("drops the 'all' sentinels rather than sending them to the API", async () => {
    await service.getAdminStations({ page: 2, search: "  egmore  ", status: "all", visibility: "all" });

    expect(calls[0].query).toMatchObject({ page: 2, search: "egmore" });
    expect((calls[0].query as Record<string, unknown>).status).toBeUndefined();
    expect((calls[0].query as Record<string, unknown>).visibility).toBeUndefined();
  });

  it("passes real filters through", async () => {
    await service.getAdminStations({ status: "MAINTENANCE", visibility: "hidden", sortBy: "name", sortDir: "desc" });

    expect(calls[0].query).toMatchObject({
      status: "MAINTENANCE",
      visibility: "hidden",
      sortBy: "name",
      sortDir: "desc",
    });
  });

  it("reads the rider-facing list from the mobile endpoint", async () => {
    await service.getMobileStations({ status: "WORKING" });
    expect(calls[0]).toMatchObject({ method: "GET", path: "/battery-stations" });
  });
});

describe("display formatting", () => {
  it("shows underscores as spaces without changing the stored name", () => {
    expect(formatStationName("Mogappaire_Hub")).toBe("Mogappaire Hub");
  });

  it("renders coordinates to six decimals", () => {
    expect(formatCoordinate(13.0648)).toBe("13.064800");
    expect(formatCoordinate(80.2619914)).toBe("80.261991");
  });
});
