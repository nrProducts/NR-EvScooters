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

/**
 * POST /vehicles/import/commit — the rows the admin confirmed, exactly as the
 * preview returned them. Only the shape is checked here; commitImport
 * re-validates every value against the same rules as the single form.
 */
const importCell = z.string().max(500).nullable();
export const commitVehicleImportBody = z.object({
    rows: z.array(z.object({
        row: z.number().int().min(2),
        registration_number: importCell,
        vin: importCell,
        model: importCell,
        name: importCell,
        hub_code: importCell,
        color: importCell,
        qr_code: importCell,
        imei: importCell,
        purchase_date: importCell,
        batch_number: importCell,
    })).min(1, "There are no vehicles to import.").max(500),
});

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

export const unassignVehicleBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

export const assignVehicleToUserBody = z.object({
    user_id: z.string().uuid("Pick a rider to assign this vehicle to."),
    unassign_existing: z.boolean().optional(),
});

// --- vehicle documents (RC / insurance / PUC / fitness / permit) --------

export const VEHICLE_DOCUMENT_TYPES = ["registration", "insurance", "puc", "fitness", "permit"] as const;

export const documentIdParam = z.object({ documentId: z.string().uuid("A valid document id is required.") });

/**
 * multipart/form-data — the file arrives via multer, not in this body, same
 * split as kyc.validation.ts's uploadDocumentBody.
 */
export const createVehicleDocumentBody = z.object({
    doc_type: z.enum(VEHICLE_DOCUMENT_TYPES),
    doc_number: z.string().trim().min(1, "Enter the document number.").max(80),
    issued_on: dateSchema.optional(),
    expires_on: dateSchema,
});

// Multipart, so "no issue date" arrives as an empty string, not null — and a
// replacement file alone (no fields) is a valid edit, which is why there is no
// "at least one field" rule here: the file isn't part of the body, so the
// service checks that something actually changed instead.
export const updateVehicleDocumentBody = z
    .object({
        doc_number: z.string().trim().min(1, "Enter the document number.").max(80).optional(),
        issued_on: z.preprocess((v) => (v === "" ? null : v), dateSchema.nullable()).optional(),
        expires_on: dateSchema.optional(),
    })
    .strict();
