import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { MAINTENANCE_STATUSES } from "./maintenance.types";

const statusEnum = z.enum(MAINTENANCE_STATUSES as [string, ...string[]]);

export const uuidParam = z.object({ id: z.string().uuid("A valid maintenance ticket id is required.") });

export const listMaintenanceQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: statusEnum.optional(),
    vehicleId: z.string().uuid().optional(),
});

/**
 * Same shape as the staff filters above, but a different endpoint: the rider's
 * results are additionally scoped to vehicles they rented, from their pickup
 * onward. See getMyMaintenanceHistory.
 */
export const myMaintenanceHistoryQuery = listMaintenanceQuery;

export const createMaintenanceBody = z.object({
    vehicle_id: z.string().uuid("Select a vehicle."),
    description: z.string().trim().min(3, "Describe the issue.").max(1000),
    status: statusEnum.optional(),
});

export const updateMaintenanceBody = z
    .object({
        status: statusEnum.optional(),
        description: z.string().trim().min(3).max(1000).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.");

export const quickFixBody = z.object({
    expected_ready_at: z
        .string()
        .datetime("Provide a valid ETA.")
        .refine((v) => new Date(v).getTime() > Date.now(), "The ETA should be in the future."),
});

export const tempVehicleBody = z.object({
    temp_vehicle_id: z.string().uuid("Pick a temp vehicle."),
});

export const notRepairableBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
    estimated_value: z.coerce.number().min(0).optional(),
    scrapped_on: dateSchema.optional(),
});

export const reassignBody = z.object({
    replacement_vehicle_id: z.string().uuid("Pick a replacement vehicle."),
});
