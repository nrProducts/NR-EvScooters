import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.");

const statusEnum = z.enum(["pending", "approved", "rejected", "cancelled"]);

export const uuidParam = z.object({ id: z.string().uuid("A valid leave request id is required.") });

export const applyLeaveBody = z
    .object({
        leave_type_id: z.string().uuid("Select a leave type."),
        start_date: dateSchema,
        end_date: dateSchema,
        reason: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((v) => v.end_date >= v.start_date, {
        message: "End date must be on or after the start date.",
        path: ["end_date"],
    });

export const reviewLeaveBody = z
    .object({
        review_note: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500).optional(),
    })
    .strict();

/** Same body shape as approve, but review_note is required for a rejection to make sense. */
export const rejectLeaveBody = z
    .object({
        review_note: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
    })
    .strict();

export const myLeaveQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: statusEnum.optional(),
});

export const listLeaveQuery = myLeaveQuery.extend({
    userId: z.string().uuid().optional(),
    leaveTypeId: z.string().uuid().optional(),
});

export const previewLeaveQuery = z
    .object({ start_date: dateSchema, end_date: dateSchema })
    .refine((v) => v.end_date >= v.start_date, {
        message: "End date must be on or after the start date.",
        path: ["end_date"],
    });
