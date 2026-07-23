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

export const bookingIdParam = z.object({ id: z.string().uuid("A valid booking id is required.") });

export const pickupQueueQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    stationId: z.string().uuid().optional(),
});

export const confirmPickupBody = z.object({
    vehicle_id: z.string().uuid("A valid vehicle id is required."),
});

export type PickupQueueQuery = z.infer<typeof pickupQueueQuery>;
export type ConfirmPickupBody = z.infer<typeof confirmPickupBody>;
