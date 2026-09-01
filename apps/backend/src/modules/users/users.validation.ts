import { z } from "zod";
import { KYC_STATUSES, USER_ROLES, USER_STATUSES } from "../../types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const uuidParam = z.object({ id: z.string().uuid("A valid user id is required.") });

export const registerPushTokenBody = z.object({
    token: z.string().trim().min(10, "A valid push token is required."),
    platform: z.enum(["ios", "android"]).optional(),
});

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

/** Personal names: letters, spaces, apostrophes and hyphens only (e.g. "O'Brien", "Anne-Marie"). */
const personNameSchema = z
    .string()
    .trim()
    .regex(/^[A-Za-z\s'-]+$/, "Use letters only (spaces, apostrophes and hyphens allowed).");

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
    accountStatus: z.enum(USER_STATUSES as [string, ...string[]]).optional(),
    kycStatus: z.enum(KYC_STATUSES as [string, ...string[]]).optional(),
    role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
    staffOnly: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
    sortBy: z.enum(["full_name", "created_at", "kyc_status"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    includeDeleted: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
    // Rider-picker filter for "create booking": drop riders who already have an
    // active booking or rental, since adminCreateBooking would reject them.
    bookable: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
});

export const createUserBody = z.object({
    full_name: personNameSchema.min(2, "Enter the rider's full name.").max(120),
    email: emailSchema,
    phone: phoneSchema,
    date_of_birth: dobSchema.optional(),
    gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
    ...addressFields,
    emergency_contact_name: personNameSchema.max(120).optional(),
    emergency_contact_phone: phoneSchema.optional(),
    role: z.enum(USER_ROLES as [string, ...string[]]).default("rider"),
    account_status: z.enum(USER_STATUSES as [string, ...string[]]).default("active"),
    // Staff/admin only — an optional operator-entered identifier, not auto-generated.
    staff_code: z.string().trim().min(1).max(40).optional(),
    // Applied right after the role is set, on top of createUser()'s existing
    // admin-only gate on non-rider roles. Omitted for a rider, or for a staff
    // account the admin means to build from a blank slate ("Custom").
    // A `permission_profiles.code`. Not an enum: the profiles are rows now,
    // so the set is only knowable at runtime — the service checks it against
    // the table and 404s on an unknown code.
    permission_profile: z.string().trim().min(1).max(60).optional(),
});

/** Fields an admin/staff member may change on someone else. */
export const updateUserBody = z
    .object({
        full_name: personNameSchema.min(2).max(120).optional(),
        email: emailSchema.optional(),
        phone: phoneSchema.optional(),
        date_of_birth: dobSchema.optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        ...addressFields,
        emergency_contact_name: personNameSchema.max(120).optional(),
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
        full_name: personNameSchema.min(2).max(120).optional(),
        // Needed for the initial-profile onboarding form (phone sign-ups have
        // no email on the Auth account yet). updateUser() syncs this to
        // Supabase Auth the same way it does for a staff-initiated edit.
        email: emailSchema.optional(),
        phone: phoneSchema.optional(),
        date_of_birth: dobSchema.optional(),
        gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
        ...addressFields,
        emergency_contact_name: personNameSchema.max(120).optional(),
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

/**
 * A user has exactly one role now. The legacy `{ roles: [...] }` shape is
 * still accepted so the console keeps working until Stage 10 updates it;
 * anything longer than one element is rejected rather than silently truncated.
 */
export const updateRolesBody = z
    .object({
        role: z.enum(USER_ROLES as [string, ...string[]]).optional(),
        roles: z
            .array(z.enum(USER_ROLES as [string, ...string[]]))
            .length(1, "A user has exactly one role.")
            .optional(),
    })
    .refine((v) => !!v.role || !!v.roles, "A role is required.");

/**
 * Empty array is valid — "revoke every module" is a legitimate call.
 *
 * Neither the module keys nor the actions are enumerated here any more. They
 * are rows in `modules` and `permissions`, so zod cannot know them at build
 * time; `replaceModulePermissions` resolves every `<module>.<action>` pair
 * against the table and reports the unknown ones together. The bounds below
 * are there to stop an absurd payload, not to validate content.
 */
export const updatePermissionsBody = z.object({
    modules: z
        .array(
            z.object({
                module_key: z.string().trim().min(1).max(40),
                actions: z.array(z.string().trim().min(1).max(40)).max(20),
            }),
        )
        .max(50),
});

export const applyPermissionProfileBody = z.object({
    profile: z.string().trim().min(1).max(60),
});

/** Normalises an email the same way the unique index does (lower(email)). */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/** Strips spaces/dashes so "+91 98765-43210" and "+919876543210" collide. */
export const normalisePhone = (phone: string): string => phone.replace(/[\s()-]/g, "");
