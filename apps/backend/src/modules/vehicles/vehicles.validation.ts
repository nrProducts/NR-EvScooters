import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { VEHICLE_STATUSES } from "./vehicles.types";

export const uuidParam = z.object({ id: z.string().uuid("A valid vehicle id is required.") });

const statusEnum = z.enum(VEHICLE_STATUSES as [string, ...string[]]);

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.");

export const listVehiclesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).max(100).optional(),
    status: statusEnum.optional(),
    // `name` is `display_name`; battery charge and service dates are no
    // longer columns, so they cannot be sorted on.
    sortBy: z.enum(["created_at", "display_name", "registration_number"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

/**
 * `manufacturer`, `model`, `battery_number`, `battery_percentage` and the two
 * service dates are gone: they describe the MODEL, not the unit, and the model
 * is now a foreign key. Insurance moved to `vehicle_documents` alongside
 * registration and PUC, which is where it always belonged — it expires, and a
 * pair of columns could not express a renewal history.
 *
 * `status` is not accepted at all. `recompute_vehicle_status()` derives it, so
 * a supplied value would be silently overwritten; rejecting it says so.
 */
export const createVehicleBody = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    registration_number: z.string().trim().min(1, "Enter the registration number.").max(40),
    vin: z.string().trim().min(1, "Enter the VIN.").max(60),
    vehicle_model_id: z.string().uuid("Pick the model this vehicle is."),
    hub_id: z.string().uuid("Pick the hub this vehicle belongs to.").optional(),
    color: z.string().trim().max(60).optional(),
    qr_code: z.string().trim().max(120).optional(),
    imei: z.string().trim().max(40).optional(),
    purchase_date: dateSchema.optional(),
    batch_number: z.string().trim().min(1).max(60).optional(),
}).strict();

export const updateVehicleBody = z
    .object({
        name: z.string().trim().min(1).max(120).nullable().optional(),
        registration_number: z.string().trim().min(1).max(40).optional(),
        vin: z.string().trim().min(1).max(60).optional(),
        hub_id: z.string().uuid().nullable().optional(),
        color: z.string().trim().max(60).nullable().optional(),
        qr_code: z.string().trim().max(120).nullable().optional(),
        imei: z.string().trim().max(40).nullable().optional(),
        purchase_date: dateSchema.nullable().optional(),
        batch_number: z.string().trim().min(1).max(60).nullable().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

// uploadVehiclePhotoBody / photoIdParam are gone with the vehicle_photos
// table — see the note in vehicles.controller.ts.

export const scrapVehicleBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
    estimated_value: z.coerce.number().min(0).optional(),
    scrapped_on: dateSchema.optional(),
});

export const assignVehicleToUserBody = z.object({
    user_id: z.string().uuid("Pick a rider to assign this vehicle to."),
    unassign_existing: z.boolean().optional(),
});
