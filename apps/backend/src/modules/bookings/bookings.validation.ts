import { z } from "zod";
import { isValidStartDay } from "./bookings.service";

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
