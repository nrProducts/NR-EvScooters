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
    sortBy: z.enum(["created_at"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
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

const damageItemSchema = z.object({
    part: z.string().trim().min(2, "Name the damaged part.").max(80),
    notes: z.string().trim().max(300).nullish(),
    // Before GST. Zero is allowed for a part that is only being recorded.
    amount: z.number().min(0, "The amount can't be negative.").max(10_000_000),
});

/** The damage recorded together with "Mark resolved" — see ResolveDamageInput. */
const resolveDamageSchema = z.object({
    items: z.array(damageItemSchema).min(1, "Add at least one damaged part.").max(20),
    gst_rate: z.number().min(0, "GST can't be negative.").max(100, "GST can't be more than 100%.").default(0),
    bill_rider: z.boolean().default(false),
    // Who to bill when the ticket has no linked rider (staff pick one).
    bill_user_id: z.string().uuid().optional(),
    paid_via: z.enum(["upi", "cash", "card", "netbanking", "wallet"]).optional(),
}).refine((d) => (!d.bill_rider && !d.paid_via) || d.items.reduce((s, i) => s + i.amount, 0) > 0, {
    message: "Enter an amount greater than zero to bill the rider or record a payment.",
    path: ["items"],
});

export const updateMaintenanceBody = z
    .object({
        status: statusEnum.optional(),
        description: z.string().trim().min(3).max(1000).optional(),
        damage: resolveDamageSchema.optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.")
    // Alongside "resolved", or on its own for a ticket that is already
    // resolved — the service checks which, since it knows the ticket's state.
    .refine((v) => !v.damage || v.status === undefined || v.status === "resolved", {
        message: "Damage can only be recorded while resolving a ticket, or added to one already resolved.",
        path: ["damage"],
    });

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
