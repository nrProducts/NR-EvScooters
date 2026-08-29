import { z } from "zod";
import { isValidStartDay } from "./bookings.service";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const startDaySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.")
    .refine((v) => isValidStartDay(v), "Pick a day between Monday and Saturday, today or later.");

export const createBookingBody = z.object({
    vehicle_model_id: z.string().uuid("A valid vehicle model id is required."),
    station_id: z.string().uuid("A valid station id is required."),
    plan_id: z.string().uuid("A valid plan id is required."),
    start_day: startDaySchema,
});

export type CreateBookingBody = z.infer<typeof createBookingBody>;

export const adminCreateBookingBody = z.object({
    user_id: z.string().uuid("Select a rider."),
    vehicle_model_id: z.string().uuid("A valid vehicle model id is required."),
    station_id: z.string().uuid("A valid station id is required."),
    plan_id: z.string().uuid("A valid plan id is required."),
    start_day: startDaySchema,
    /** Override the plan's duration for this booking (derived from the end date the admin picks). */
    duration_days: z.number().int().min(1).max(366).optional(),
    payment: z.object({
        method: z.enum(["upi", "card", "netbanking", "wallet", "cash"]),
        status: z.enum(["paid", "pending"]),
        /** Default true. False removes the auto transaction-fee line from the bill. */
        apply_transaction_fee: z.boolean().optional(),
        /** Default true. False removes the auto welcome-discount line from the bill. */
        apply_welcome_discount: z.boolean().optional(),
        /** Exact amount collected — a manual adjustment line reconciles the invoice to it. */
        amount: z.number().min(0).max(10_000_000).optional(),
    }).optional(),
});

export type AdminCreateBookingBody = z.infer<typeof adminCreateBookingBody>;

export const bookingIdParam = z.object({ id: z.string().uuid("A valid booking id is required.") });

export const pickupQueueQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    stationId: z.string().uuid().optional(),
    /** Omit to see every status (the "All" tab) — no default is applied server-side. */
    status: z
        .enum(["pending_payment", "confirmed", "cancelled", "expired", "fulfilled", "completed"])
        .optional(),
    /** Further narrows a 'fulfilled' view into Active/Due/Paused. Ignored for any other status. */
    // `due` is `past_due` on subscriptions.status.
    planStatus: z.enum(["active", "past_due", "paused"]).optional(),
    /** Rental Operations' "Scheduled Renewals" tab — fulfilled bookings that have paid ahead. */
    renewalStatus: z.enum(["scheduled"]).optional(),
    /** Rental Operations' "Return Requests" tab — only bookings whose active rental has a pending return. */
    returnRequested: z.coerce.boolean().optional(),
    /** "Awaiting Assignment" summary count — confirmed bookings with no vehicle allocated yet. */
    unassigned: z.coerce.boolean().optional(),
    /** Matches rider name/phone, vehicle registration number, booking id, or rental id. */
    search: z.string().trim().max(200).optional(),
    // `next_due_at` is gone as a sort key: it lives on the subscription's
    // current period now, and PostgREST cannot order a parent by a grandchild.
    sortBy: z.enum(["created_at", "requested_start_on"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const bookingHistoryQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const confirmPickupBody = z.object({
    vehicle_id: z.string().uuid("A valid vehicle id is required.").optional(),
});

export const rejectBookingBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500),
});

/** null clears the override, reverting this booking to the global plan_renewal_settings amount. */
export const lateFeeOverrideBody = z.object({
    late_fee_override: z.number().min(0).max(100000).nullable(),
});
export type LateFeeOverrideBody = z.infer<typeof lateFeeOverrideBody>;

/** Reason is optional here — unlike a staff reject, a rider owes no explanation. */
export const cancelBookingBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(500).optional(),
});

export type PickupQueueQuery = z.infer<typeof pickupQueueQuery>;
export type BookingHistoryQuery = z.infer<typeof bookingHistoryQuery>;
export type ConfirmPickupBody = z.infer<typeof confirmPickupBody>;
export type RejectBookingBody = z.infer<typeof rejectBookingBody>;
export type CancelBookingBody = z.infer<typeof cancelBookingBody>;
