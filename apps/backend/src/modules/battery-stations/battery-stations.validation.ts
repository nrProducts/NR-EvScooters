import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { BATTERY_STATION_STATUSES } from "./battery-stations.types";

const statusEnum = z.enum(BATTERY_STATION_STATUSES);

export const uuidParam = z.object({
    id: z.string().uuid("A valid battery station id is required."),
});

const latitude = z.coerce
    .number()
    .refine(Number.isFinite, "Enter a latitude.")
    .min(-90, "Latitude must be between -90 and 90.")
    .max(90, "Latitude must be between -90 and 90.");

const longitude = z.coerce
    .number()
    .refine(Number.isFinite, "Enter a longitude.")
    .min(-180, "Longitude must be between -180 and 180.")
    .max(180, "Longitude must be between -180 and 180.");

/**
 * Trimmed, de-blanked, and checked for duplicates case-insensitively —
 * "qis-1" and "QIS-1" are the same physical device, so accepting both would
 * defeat the point of the uniqueness rule.
 */
const qisIds = z
    .array(z.string().trim().min(1, "A QIS ID cannot be blank.").max(64))
    .min(1, "Add at least one QIS ID.")
    .max(20, "A station can hold at most 20 QIS IDs.")
    .refine(
        (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
        "Remove the duplicate QIS IDs.",
    );

const batteryCount = z.coerce
    .number()
    .int("Enter a whole number of batteries.")
    .min(0, "Battery count cannot be negative.")
    .max(10_000, "That battery count looks wrong.");

// --- mobile ------------------------------------------------------------

/**
 * latitude/longitude/radiusKm travel together: a radius means nothing without
 * an origin, and an origin with no radius is still useful (it just adds
 * distanceKm to every station), so only the half-supplied origin is rejected.
 */
export const listMobileStationsQuery = z
    .object({
        status: statusEnum.optional(),
        search: z.string().trim().min(1).max(120).optional(),
        latitude: latitude.optional(),
        longitude: longitude.optional(),
        radiusKm: z.coerce.number().positive("Radius must be greater than zero.").max(20_000).optional(),
    })
    .refine(
        (q) => (q.latitude === undefined) === (q.longitude === undefined),
        { message: "Provide both latitude and longitude, or neither.", path: ["latitude"] },
    )
    .refine((q) => q.radiusKm === undefined || q.latitude !== undefined, {
        message: "radiusKm needs a latitude and longitude to measure from.",
        path: ["radiusKm"],
    });

export type ListMobileStationsQuery = z.infer<typeof listMobileStationsQuery>;

// --- admin -------------------------------------------------------------

export const listAdminStationsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).max(120).optional(),
    status: statusEnum.optional(),
    visibility: z.enum(["visible", "hidden"]).optional(),
    sortBy: z.enum(["name", "batteryCount", "updatedAt", "serialNumber"]).default("serialNumber"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type ListAdminStationsQuery = z.infer<typeof listAdminStationsQuery>;

export const createStationBody = z.object({
    name: z.string().trim().min(2, "Enter the station name.").max(160),
    qisIds,
    latitude,
    longitude,
    status: statusEnum.optional(),
    batteryCount,
    isVisibleOnMobile: z.boolean().optional(),
    /** Optional: the service allocates the next free serial when omitted. */
    serialNumber: z.coerce.number().int().min(1).optional(),
});

export type CreateStationBody = z.infer<typeof createStationBody>;

export const updateStationBody = z
    .object({
        name: z.string().trim().min(2, "Enter the station name.").max(160).optional(),
        qisIds: qisIds.optional(),
        latitude: latitude.optional(),
        longitude: longitude.optional(),
        status: statusEnum.optional(),
        batteryCount: batteryCount.optional(),
        isVisibleOnMobile: z.boolean().optional(),
        serialNumber: z.coerce.number().int().min(1).optional(),
    })
    .strict()
    .refine((patch) => Object.keys(patch).length > 0, "Provide at least one field to update.");

export type UpdateStationBody = z.infer<typeof updateStationBody>;

export const visibilityBody = z.object({
    isVisibleOnMobile: z.boolean({ message: "isVisibleOnMobile must be true or false." }),
});

export type VisibilityBody = z.infer<typeof visibilityBody>;
