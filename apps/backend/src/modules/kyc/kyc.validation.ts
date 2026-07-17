import { z } from "zod";
import { KYC_DOC_TYPES, KYC_STATUSES } from "../../types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const documentIdParam = z.object({
    documentId: z.string().uuid("A valid document id is required."),
});

export const userIdParam = z.object({
    userId: z.string().uuid("A valid user id is required."),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");

/**
 * Multipart bodies arrive as strings, so everything here is string-shaped and
 * coerced. Document numbers are checked for length/shape per the spec; the
 * pattern stays deliberately broad because national ID formats vary by state.
 */
export const uploadDocumentBody = z.object({
    doc_type: z.enum(KYC_DOC_TYPES as [string, ...string[]]),
    doc_number: z
        .string()
        .trim()
        .min(4, "A document number must be at least 4 characters.")
        .max(32, "A document number must be 32 characters or fewer.")
        .regex(/^[A-Za-z0-9 -]+$/, "Use letters, numbers, spaces or hyphens only."),
    expiry_date: isoDate.optional(),
});

export const updateDocumentBody = z
    .object({
        doc_number: uploadDocumentBody.shape.doc_number.optional(),
        expiry_date: isoDate.optional(),
    })
    .refine(
        (v) => Object.keys(v).length > 0,
        "Provide a document number, an expiry date or a replacement file.",
    );

export const rejectBody = z.object({
    reason: z
        .string()
        .trim()
        .min(10, "Give the rider a reason of at least 10 characters.")
        .max(500),
});

export const signedUrlQuery = z.object({
    side: z.enum(["front", "back"]).default("front"),
});

export const kycListQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).max(100).optional(),
    status: z.enum(KYC_STATUSES as [string, ...string[]]).optional(),
    docType: z.enum(KYC_DOC_TYPES as [string, ...string[]]).optional(),
    submittedFrom: z.string().datetime().optional(),
    submittedTo: z.string().datetime().optional(),
    expiringBefore: isoDate.optional(),
    sortBy: z.enum(["submitted_at", "full_name", "kyc_status"]).default("submitted_at"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
});
