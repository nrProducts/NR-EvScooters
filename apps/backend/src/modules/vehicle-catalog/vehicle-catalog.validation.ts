import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { VEHICLE_CATEGORIES } from "./vehicle-catalog.types";

export const uuidParam = z.object({ id: z.string().uuid("A valid vehicle model id is required.") });

export const availabilityQuery = z.object({
    stationId: z.string().uuid().optional(),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuery>;

export const listVehicleModelsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    category: z.enum(VEHICLE_CATEGORIES as [string, ...string[]]).optional(),
    vendorId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(["name", "created_at", "battery_range_km", "sort_order"]).default("sort_order"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
});
