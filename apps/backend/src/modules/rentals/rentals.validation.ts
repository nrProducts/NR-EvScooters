import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { RENTAL_STATUSES } from "./rentals.types";

export const rentalHistoryQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type RentalHistoryQuery = z.infer<typeof rentalHistoryQuery>;

export const rentalIdParam = z.object({ id: z.string().uuid("A valid rental id is required.") });

export const listRentalsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(RENTAL_STATUSES as [string, ...string[]]).optional(),
});

export const completeRideBody = z.object({
    end_battery_pct: z.coerce.number().min(0).max(100).optional(),
});

export const moveToMaintenanceBody = z.object({
    description: z.string().trim().min(3, "Describe the issue.").max(1000),
    end_battery_pct: z.coerce.number().min(0).max(100).optional(),
});

export type CompleteRideBody = z.infer<typeof completeRideBody>;
export type MoveToMaintenanceBody = z.infer<typeof moveToMaintenanceBody>;
