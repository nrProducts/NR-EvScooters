import { z } from "zod";

export const bookingIdParam = z.object({ id: z.string().uuid("A valid booking id is required.") });
export const invoiceIdParam = z.object({ id: z.string().uuid("A valid invoice id is required.") });

export const verifyPaymentBody = z.object({
    razorpay_order_id: z.string().min(1, "razorpay_order_id is required."),
    razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required."),
    razorpay_signature: z.string().min(1, "razorpay_signature is required."),
});

export type VerifyPaymentBody = z.infer<typeof verifyPaymentBody>;

export const quotePlanParams = z.object({
    planId: z.string().uuid("A valid plan id is required."),
});

export const quotePlanQuery = z.object({
    /** Optional; defaults to today (IST) server-side. */
    start_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.").optional(),
});
