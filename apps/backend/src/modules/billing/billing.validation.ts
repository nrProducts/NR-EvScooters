import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

// `pricing_rules.code` is free text — a new charge type must not need a
// deploy. CHARGE_CODES is the shipped set, not the permitted one.
const chargeCodeSchema = z.string().trim().min(1).max(60);
const discountCodeSchema = z.string().trim().min(1).max(60);
const amountTypeSchema = z.enum(["fixed", "percentage"]);
// `rule_frequency`: a period, not a "cycle"; `per_booking` meant "once",
// which `one_time` already covers; `first_n_periods` is new.
const frequencyTypeSchema = z.enum(["one_time", "every_period", "every_n_periods", "first_n_periods", "per_day"]);
const discountFrequencyTypeSchema = z.enum(["one_time", "every_period", "first_n_periods"]);
// `rule_scope` gained plan / vehicle_model / subscription.
const scopeSchema = z.enum(["global", "plan", "vehicle_model", "vehicle", "subscription"]);

export const chargeRuleIdParam = z.object({ id: z.string().uuid("A valid charge rule id is required.") });
export const riderChargeIdParam = z.object({ id: z.string().uuid("A valid rider charge id is required.") });

export const listChargeRulesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    chargeCode: chargeCodeSchema.optional(),
    scope: scopeSchema.optional(),
    vehicleId: z.string().uuid().optional(),
    active: z.coerce.boolean().optional(),
});

/**
 * scope='vehicle' requires vehicle_id (and vice versa) — mirrors the DB's
 * own chk_charge_rules_vehicle_scope constraint, so a bad combination is a
 * clean 400 here rather than a raw constraint-violation error.
 */
export const createChargeRuleBody = z
    .object({
        charge_code: chargeCodeSchema,
        charge_name: z.string().trim().min(1, "Name is required.").max(120),
        description: z.string().trim().max(1000).optional(),
        amount_type: amountTypeSchema,
        amount: z.coerce.number().min(0, "Amount can't be negative."),
        frequency_type: frequencyTypeSchema,
        frequency_n: z.coerce.number().int().positive().optional(),
        scope: scopeSchema,
        vehicle_id: z.string().uuid().optional(),
        effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
        effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
        active: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
        if (v.scope === "vehicle" && !v.vehicle_id) {
            ctx.addIssue({ code: "custom", path: ["vehicle_id"], message: "Pick a vehicle for a vehicle-specific rule." });
        }
        if (v.scope === "global" && v.vehicle_id) {
            ctx.addIssue({ code: "custom", path: ["vehicle_id"], message: "A global rule can't be tied to one vehicle." });
        }
        if (v.frequency_type === "every_n_periods" && !v.frequency_n) {
            ctx.addIssue({ code: "custom", path: ["frequency_n"], message: "Give the cycle interval (e.g. 4)." });
        }
    });

export const updateChargeRuleBody = z.object({
    charge_name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    amount_type: amountTypeSchema.optional(),
    amount: z.coerce.number().min(0, "Amount can't be negative.").optional(),
    frequency_type: frequencyTypeSchema.optional(),
    frequency_n: z.coerce.number().int().positive().nullable().optional(),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
    effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").nullable().optional(),
    active: z.boolean().optional(),
});

export const listRiderChargesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    bookingId: z.string().uuid().optional(),
    // `adjustment_status`: `paid` is `settled`, `waived`/`cancelled` are `voided`.
    status: z.enum(["pending", "invoiced", "settled", "voided"]).optional(),
});

export const waiveRiderChargeBody = z.object({
    waived_amount: z.coerce.number().min(0, "Waived amount can't be negative."),
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

export type ListChargeRulesQuery = z.infer<typeof listChargeRulesQuery>;
export type CreateChargeRuleBody = z.infer<typeof createChargeRuleBody>;
export type UpdateChargeRuleBody = z.infer<typeof updateChargeRuleBody>;
export type ListRiderChargesQuery = z.infer<typeof listRiderChargesQuery>;
export type WaiveRiderChargeBody = z.infer<typeof waiveRiderChargeBody>;

// ---------------------------------------------------------------------------
// Discount Rules — mirrors Charge Rules validation exactly.
// ---------------------------------------------------------------------------

export const discountRuleIdParam = z.object({ id: z.string().uuid("A valid discount rule id is required.") });
export const riderDiscountIdParam = z.object({ id: z.string().uuid("A valid rider discount id is required.") });

export const listDiscountRulesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    discountCode: discountCodeSchema.optional(),
    scope: scopeSchema.optional(),
    vehicleId: z.string().uuid().optional(),
    active: z.coerce.boolean().optional(),
});

export const createDiscountRuleBody = z
    .object({
        discount_code: discountCodeSchema,
        discount_name: z.string().trim().min(1, "Name is required.").max(120),
        description: z.string().trim().max(1000).optional(),
        discount_type: amountTypeSchema,
        value: z.coerce.number().min(0, "Value can't be negative."),
        frequency_type: discountFrequencyTypeSchema,
        frequency_n: z.coerce.number().int().positive().optional(),
        scope: scopeSchema,
        vehicle_id: z.string().uuid().optional(),
        effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
        effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
        active: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
        if (v.scope === "vehicle" && !v.vehicle_id) {
            ctx.addIssue({ code: "custom", path: ["vehicle_id"], message: "Pick a vehicle for a vehicle-specific rule." });
        }
        if (v.scope === "global" && v.vehicle_id) {
            ctx.addIssue({ code: "custom", path: ["vehicle_id"], message: "A global rule can't be tied to one vehicle." });
        }
        if (v.frequency_type === "first_n_periods" && !v.frequency_n) {
            ctx.addIssue({ code: "custom", path: ["frequency_n"], message: "Give the number of cycles (e.g. 4)." });
        }
        if (v.discount_type === "percentage" && v.value > 100) {
            ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage discount can't exceed 100%." });
        }
    });

export const updateDiscountRuleBody = z
    .object({
        discount_name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        discount_type: amountTypeSchema.optional(),
        value: z.coerce.number().min(0, "Value can't be negative.").optional(),
        frequency_type: discountFrequencyTypeSchema.optional(),
        frequency_n: z.coerce.number().int().positive().nullable().optional(),
        effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
        effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").nullable().optional(),
        active: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
        if (v.discount_type === "percentage" && v.value != null && v.value > 100) {
            ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage discount can't exceed 100%." });
        }
    });

export const listRiderDiscountsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    bookingId: z.string().uuid().optional(),
    // Same `adjustment_status` as charges — discounts share the table.
    status: z.enum(["pending", "invoiced", "settled", "voided"]).optional(),
});

/** Reason mandatory, same convention as rejectBookingBody / waiveRiderChargeBody. */
export const cancelRiderDiscountBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

export type ListDiscountRulesQuery = z.infer<typeof listDiscountRulesQuery>;
export type CreateDiscountRuleBody = z.infer<typeof createDiscountRuleBody>;
export type UpdateDiscountRuleBody = z.infer<typeof updateDiscountRuleBody>;
export type ListRiderDiscountsQuery = z.infer<typeof listRiderDiscountsQuery>;
export type CancelRiderDiscountBody = z.infer<typeof cancelRiderDiscountBody>;
