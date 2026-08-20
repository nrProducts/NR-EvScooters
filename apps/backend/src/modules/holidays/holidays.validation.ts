import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const dateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.");

export const uuidParam = z.object({ id: z.string().uuid("A valid holiday id is required.") });

export const createHolidayBody = z
    .object({
        name: z.string().trim().min(2, "Give the holiday a name.").max(120),
        holiday_date: dateSchema,
        description: z.string().trim().max(500).optional(),
        is_active: z.boolean().optional(),
    })
    .strict();

export const updateHolidayBody = z
    .object({
        name: z.string().trim().min(2).max(120).optional(),
        holiday_date: dateSchema.optional(),
        description: z.string().trim().max(500).nullable().optional(),
        is_active: z.boolean().optional(),
    })
    .strict();

export const listHolidayQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    upcoming: z.coerce.boolean().optional(),
});
