import { z } from "zod";

/** E.164-ish: optional +, leading non-zero, 8–15 digits. Matches the phone
 *  rule used in the users module so numbers validate identically everywhere. */
export const e164Phone = z
    .string()
    .trim()
    .transform((p) => p.replace(/[\s()-]/g, ""))
    .refine((p) => /^\+?[1-9]\d{7,14}$/.test(p), "Enter a valid phone number in international format.");

/** Body for POST /auth/otp/test (admin diagnostic). */
export const otpTestBody = z.object({
    phone: e164Phone,
});

export type OtpTestBody = z.infer<typeof otpTestBody>;
