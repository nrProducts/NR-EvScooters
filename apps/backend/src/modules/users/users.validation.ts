import { z } from "zod";
import { ACCOUNT_STATUSES, KYC_STATUSES, ROLE_NAMES } from "../../types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const uuidParam = z.object({ id: z.string().uuid("A valid user id is required.") });

/** Route params that accept the "me" alias alongside a real uuid. */
export const uuidOrMeParam = z.object({
    id: z.union([z.literal("me"), z.string().uuid("A valid user id is required.")]),
});

/** E.164-ish. Deliberately permissive on country prefix, strict on shape. */
const phoneSchema = z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number in international format.");

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

const dobSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a real date.")
    .refine((v) => new Date(v) < new Date(), "Date of birth must be in the past.")
    .refine((v) => yearsSince(v) >= 18, "The rider must be at least 18 years old.")
    .refine((v) => yearsSince(v) <= 120, "Enter a real date of birth.");

function yearsSince(iso: string): number {
    const then = new Date(iso);
    const now = new Date();
    let age = now.getFullYear() - then.getFullYear();
    const m = now.getMonth() - then.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < then.getDate())) age--;
    return age;
}

const addressFields = {
    address_line_1: z.string().trim().min(1).max(200).optional(),
    address_line_2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    postal_code: z.string().trim().regex(/^[A-Za-z0-9 -]{3,12}$/, "Enter a valid postal code.").optional(),
    country: z.string().trim().length(2, "Use a 2-letter ISO country code.").toUpperCase().optional(),
};

export const listUsersQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).max(100).optional(),
    accountStatus: z.enum(ACCOUNT_STATUSES as [string, ...string[]]).optional(),
    kycStatus: z.enum(KYC_STATUSES as [string, ...string[]]).optional(),
    role: z.enum(ROLE_NAMES as [string, ...string[]]).optional(),
    sortBy: z.enum(["full_name", "created_at", "kyc_status"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    includeDeleted: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
});

export const createUserBody = z.object({
    full_name: z.string().trim().min(2, "Enter the rider's full name.").max(120),
    email: emailSchema,
    phone: phoneSchema,
    date_of_birth: dobSchema.optional(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
    ...addressFields,
    emergency_contact_name: z.string().trim().max(120).optional(),
    emergency_contact_phone: phoneSchema.optional(),
    role: z.enum(ROLE_NAMES as [string, ...string[]]).default("rider"),
    account_status: z.enum(ACCOUNT_STATUSES as [string, ...string[]]).default("active"),
});

/** Fields an admin/staff member may change on someone else. */
export const updateUserBody = z
    .object({
        full_name: z.string().trim().min(2).max(120).optional(),
        email: emailSchema.optional(),
        phone: phoneSchema.optional(),
        date_of_birth: dobSchema.optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        ...addressFields,
        emergency_contact_name: z.string().trim().max(120).optional(),
        emergency_contact_phone: phoneSchema.optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

/**
 * Fields a rider may change on THEMSELVES. Note the absence of
 * account_status, kyc_status and deleted_at — .strict() turns any attempt to
 * send them into a 400 rather than a silent drop (§12).
 */
export const selfUpdateUserBody = z
    .object({
        full_name: z.string().trim().min(2).max(120).optional(),
        // Needed for the initial-profile onboarding form (phone sign-ups have
        // no email on the Auth account yet). updateUser() syncs this to
        // Supabase Auth the same way it does for a staff-initiated edit.
        email: emailSchema.optional(),
        phone: phoneSchema.optional(),
        date_of_birth: dobSchema.optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        ...addressFields,
        emergency_contact_name: z.string().trim().max(120).optional(),
        emergency_contact_phone: phoneSchema.optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

export const updateStatusBody = z
    .object({
        action: z.enum(["activate", "deactivate", "suspend"]),
        reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500).optional(),
    })
    .refine((v) => v.action !== "suspend" || !!v.reason, {
        message: "A reason is required when suspending an account.",
        path: ["reason"],
    });

export const updateRolesBody = z.object({
    roles: z
        .array(z.enum(ROLE_NAMES as [string, ...string[]]))
        .min(1, "A user must keep at least one role.")
        .max(ROLE_NAMES.length),
});

/** Normalises an email the same way the unique index does (lower(email)). */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/** Strips spaces/dashes so "+91 98765-43210" and "+919876543210" collide. */
export const normalisePhone = (phone: string): string => phone.replace(/[\s()-]/g, "");
