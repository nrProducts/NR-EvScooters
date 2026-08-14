import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { RENTAL_STATUSES } from "./rentals.types";
import { RETURN_REASONS } from "./returnPolicy.constants";

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

/**
 * Rider's post-pickup return request. `rating` is required because
 * rental_feedback.rating is NOT NULL — making it optional here would surface
 * as a raw Postgres error instead of a clean 400.
 */
export const requestReturnBody = z
    .object({
        reason: z.enum(RETURN_REASONS as unknown as [string, ...string[]]),
        feedback: z.string().trim().max(1000).optional(),
        rating: z.coerce.number().int().min(1, "Rate your ride.").max(5),
    })
    .superRefine((v, ctx) => {
        if (v.reason === "other" && !v.feedback) {
            ctx.addIssue({ code: "custom", path: ["feedback"], message: "Tell us a bit more." });
        }
    });

/** Staff decline of a pending return request — a reason is mandatory, mirroring rejectBookingBody's convention. */
export const rejectReturnBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

export type CompleteRideBody = z.infer<typeof completeRideBody>;
export type MoveToMaintenanceBody = z.infer<typeof moveToMaintenanceBody>;
export type RequestReturnBody = z.infer<typeof requestReturnBody>;
export type RejectReturnBody = z.infer<typeof rejectReturnBody>;
