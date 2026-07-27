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
