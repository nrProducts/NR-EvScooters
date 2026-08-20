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

/** Body for the public POST /auth/signup — always lands as staff, see users.service.ts selfSignUpStaff(). */
export const staffSignupBody = z.object({
    full_name: z
        .string()
        .trim()
        .min(2, "Enter your full name.")
        .max(120)
        .regex(/^[A-Za-z\s'-]+$/, "Use letters only (spaces, apostrophes and hyphens allowed)."),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    phone: e164Phone,
    password: z.string().min(8, "Use at least 8 characters."),
});

export type StaffSignupBody = z.infer<typeof staffSignupBody>;

/** Query for the public GET /auth/account-exists — either an email or a phone number. */
export const accountExistsQuery = z.object({
    identifier: z.string().trim().min(1, "identifier is required"),
});

export type AccountExistsQuery = z.infer<typeof accountExistsQuery>;
