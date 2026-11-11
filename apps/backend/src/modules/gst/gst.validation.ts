import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const docIdParam = z.object({ id: z.string().uuid("A valid document id is required.") });
export const tokenParam = z.object({ token: z.string().min(20).max(600) });

const rangeShape = {
    from: isoDate,
    to: isoDate,
};

export const listTaxDocumentsQuery = z
    .object({
        ...rangeShape,
        docType: z.enum(["tax_invoice", "credit_note"]).optional(),
        source: z.enum(["invoice_paid", "invoice_unpaid_30d", "deposit_retained", "refund"]).optional(),
        search: z.string().trim().max(80).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    })
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type ListTaxDocumentsQuery = z.infer<typeof listTaxDocumentsQuery>;

export const summaryQuery = z
    .object(rangeShape)
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type SummaryQuery = z.infer<typeof summaryQuery>;

export const exportQuery = z
    .object({ ...rangeShape, format: z.enum(["xlsx", "csv"]).default("xlsx") })
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type ExportQuery = z.infer<typeof exportQuery>;

export const monthParam = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM.") });

export const returnStatusBody = z.object({
    return: z.enum(["gstr1", "gstr3b"]),
    status: z.enum(["not_started", "ready", "sent", "filed"]),
    arn: z.string().trim().max(30).nullish(),
    filedOn: isoDate.nullish(),
    taxPaidCash: z.coerce.number().min(0).nullish(),
    challanCpin: z.string().trim().max(30).nullish(),
    interestPaid: z.coerce.number().min(0).nullish(),
    lateFeePaid: z.coerce.number().min(0).nullish(),
});
export type ReturnStatusBody = z.infer<typeof returnStatusBody>;

export const myDocumentsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type MyDocumentsQuery = z.infer<typeof myDocumentsQuery>;

// Same shape the gst_settings CHECK constraints enforce, so a bad value is a
// 400 with a field message rather than a 500 from the database.
export const createGstProfileBody = z
    .object({
        effectiveFrom: isoDate,
        legalName: z.string().trim().min(2).max(200),
        tradeName: z.string().trim().max(200).nullish(),
        gstin: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN."),
        stateName: z.string().trim().min(2).max(60),
        address: z.string().trim().min(10).max(400),
        sacCode: z.string().trim().regex(/^[0-9]{4,8}$/, "SAC is 4 to 8 digits."),
        gstRate: z.coerce.number().min(0).max(40),
    });
export type CreateGstProfileBody = z.infer<typeof createGstProfileBody>;
