import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

// Three values, matching the `billing_period` enum. "yearly" was never
// storable and is now rejected rather than silently failing at the insert.
const billingCycleSchema = z.enum(["daily", "weekly", "monthly"]);

export const planIdParam = z.object({ id: z.string().uuid("A valid plan id is required.") });

export const listPlansQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    vehicleModelId: z.string().uuid().optional(),
    active: z.coerce.boolean().optional(),
    sortBy: z.enum(["created_at", "name", "price_amount"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const createPlanBody = z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    billing_cycle: billingCycleSchema,
    price: z.coerce.number().positive("Price must be greater than 0."),
    duration_days: z.coerce.number().int().positive("Duration must be at least 1 day."),
    deposit_amount: z.coerce.number().min(0, "Deposit can't be negative."),
    vehicle_model_id: z.string().uuid("A valid vehicle model id is required."),
    included_minutes: z.coerce.number().int().positive().optional(),
    active: z.boolean().optional(),
});

export const updatePlanBody = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    billing_cycle: billingCycleSchema.optional(),
    price: z.coerce.number().positive("Price must be greater than 0.").optional(),
    duration_days: z.coerce.number().int().positive("Duration must be at least 1 day.").optional(),
    deposit_amount: z.coerce.number().min(0, "Deposit can't be negative.").optional(),
    included_minutes: z.coerce.number().int().positive().nullable().optional(),
    active: z.boolean().optional(),
});

export type ListPlansQuery = z.infer<typeof listPlansQuery>;
export type CreatePlanBody = z.infer<typeof createPlanBody>;
export type UpdatePlanBody = z.infer<typeof updatePlanBody>;
