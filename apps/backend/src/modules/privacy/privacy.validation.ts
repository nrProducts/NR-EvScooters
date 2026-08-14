import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const REQUEST_TYPES = [
    "access_export", "correction", "erasure", "grievance", "nominee_update",
] as const;

const REQUEST_STATUSES = [
    "open", "in_progress", "awaiting_principal", "completed", "rejected", "withdrawn",
] as const;

/**
 * Fields a rider may ask to have corrected.
 *
 * Deliberately excludes anything they can already edit themselves via
 * PATCH /users/me — a correction request for an editable field is a support
 * burden with no purpose. It also excludes account_status and kyc_status,
 * which are decisions, not facts about the rider.
 */
const CORRECTABLE_FIELDS = [
    "full_name",
    "date_of_birth",
    "aadhaar_details",
    "driving_licence_details",
    "other",
] as const;

export const uuidParam = z.object({
    id: z.string().uuid("A valid request id is required."),
});

export const createRequestBody = z
    .object({
        type: z.enum(REQUEST_TYPES),
        details: z.string().trim().min(1).max(4000).optional(),
        requested_changes: z
            .array(
                z.object({
                    field: z.enum(CORRECTABLE_FIELDS),
                    value: z.string().trim().min(1).max(500),
                }),
            )
            .max(CORRECTABLE_FIELDS.length)
            .optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
        // A grievance with no description is not actionable, and asking the
        // rider to resubmit later is worse than refusing now.
        if (v.type === "grievance" && !v.details) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["details"],
                message: "Tell us what went wrong so we can look into it.",
            });
        }
        if (v.type === "correction" && (!v.requested_changes || v.requested_changes.length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["requested_changes"],
                message: "Tell us which detail is wrong and what it should be.",
            });
        }
    });

export const listMyRequestsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    type: z.enum(REQUEST_TYPES).optional(),
});

export const listRequestsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    type: z.enum(REQUEST_TYPES).optional(),
    status: z.enum(REQUEST_STATUSES).optional(),
    assignedTo: z.string().uuid().optional(),
    overdueOnly: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
});

/** Staff-side workflow edits. Status transitions are validated in the service. */
export const updateRequestBody = z
    .object({
        status: z.enum(["in_progress", "awaiting_principal", "completed"]).optional(),
        assigned_to: z.string().uuid().nullable().optional(),
        resolution_notes: z.string().trim().max(4000).optional(),
        ticket_ref: z.string().trim().max(120).optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field to update.");

export const rejectRequestBody = z.object({
    // Mirrors kyc.validation.rejectBody. A one-word rejection is not a reason,
    // and this one goes to the rider verbatim.
    reason: z
        .string()
        .trim()
        .min(10, "Give the rider a real reason, of at least 10 characters.")
        .max(1000),
});

export const executeErasureBody = z
    .object({
        /** Skips the cooling-off window. Requires a reason, and is audited. */
        force: z.boolean().default(false),
        reason: z.string().trim().max(1000).optional(),
    })
    .strict()
    .refine((v) => !v.force || (v.reason && v.reason.length >= 10), {
        message: "Forcing an erasure before its grace period needs a reason.",
        path: ["reason"],
    });

const phoneSchema = z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, "Enter a valid phone number in international format.");

/**
 * Nominee (DPDPA s.14).
 *
 * Minimal on purpose: this is a third party's personal data, given to us by
 * someone who is not them. Name, relationship and ONE contact channel is
 * everything needed to reach them; an address or date of birth would be
 * collection without a purpose.
 */
export const updateNomineeBody = z
    .object({
        full_name: z
            .string()
            .trim()
            .min(2, "Enter your nominee's name.")
            .max(120)
            .regex(/^[A-Za-z\s'-]+$/, "Use letters only (spaces, apostrophes and hyphens allowed)."),
        relationship: z.string().trim().min(2).max(60),
        phone: phoneSchema.optional(),
        email: z.string().trim().toLowerCase().email("Enter a valid email address.").optional(),
    })
    .strict()
    .refine((v) => !!v.phone || !!v.email, {
        message: "Give us at least one way to contact your nominee.",
        path: ["phone"],
    });

export type CreateRequestBody = z.infer<typeof createRequestBody>;
export type UpdateRequestBody = z.infer<typeof updateRequestBody>;
export type ExecuteErasureBody = z.infer<typeof executeErasureBody>;
export type UpdateNomineeBody = z.infer<typeof updateNomineeBody>;
