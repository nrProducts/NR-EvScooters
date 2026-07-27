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
    sortBy: z.enum(["created_at", "name", "battery_percentage", "next_service_due_date"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const createVehicleBody = z.object({
    name: z.string().trim().min(1, "Enter a display name for the vehicle.").max(120),
    registration_number: z.string().trim().min(1, "Enter the registration number.").max(40),
    battery_number: z.string().trim().min(1, "Enter the battery number.").max(60),
    manufacturer: z.string().trim().min(1, "Enter the manufacturer.").max(120),
    model: z.string().trim().min(1, "Enter the model.").max(120),
    vin: z.string().trim().min(1, "Enter the VIN.").max(60),
    battery_percentage: z.coerce.number().min(0).max(100).optional(),
    status: statusEnum.optional(),
    last_service_date: dateSchema.optional(),
    next_service_due_date: dateSchema.optional(),
});

export const updateVehicleBody = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        registration_number: z.string().trim().min(1).max(40).optional(),
        battery_number: z.string().trim().min(1).max(60).optional(),
        manufacturer: z.string().trim().min(1).max(120).optional(),
        model: z.string().trim().min(1).max(120).optional(),
        vin: z.string().trim().min(1).max(60).optional(),
        battery_percentage: z.coerce.number().min(0).max(100).optional(),
        status: statusEnum.optional(),
        last_service_date: dateSchema.nullable().optional(),
        next_service_due_date: dateSchema.nullable().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");
