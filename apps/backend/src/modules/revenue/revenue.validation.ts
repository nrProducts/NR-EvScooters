import { z } from "zod";
import { MAX_PAGE_SIZE } from "../../common/pagination";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");

/** from ≤ to, both required. */
const range = z.object({ from: isoDate, to: isoDate })
    .refine((v) => v.from <= v.to, { message: "`from` must be on or before `to`.", path: ["from"] });

export const revenueSummaryQuery = z.object({
    from: isoDate,
    to: isoDate,
    compareFrom: isoDate.optional(),
    compareTo: isoDate.optional(),
}).refine((v) => v.from <= v.to, { message: "`from` must be on or before `to`.", path: ["from"] })
    .refine((v) => !v.compareFrom === !v.compareTo, {
        message: "Provide both compareFrom and compareTo, or neither.", path: ["compareFrom"],
    });
export type RevenueSummaryQuery = z.infer<typeof revenueSummaryQuery>;

export const revenueTrendQuery = z.object({
    from: isoDate,
    to: isoDate,
    granularity: z.enum(["daily", "weekly", "monthly", "yearly"]).default("daily"),
}).refine((v) => v.from <= v.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type RevenueTrendQuery = z.infer<typeof revenueTrendQuery>;

export const revenueRangeQuery = range;
export type RevenueRangeQuery = z.infer<typeof revenueRangeQuery>;

const TXN_TYPES = [
    "rental_payment", "renewal_payment", "late_fee", "additional_charge",
    "damage_charge", "security_deposit", "security_deposit_refund", "refund",
] as const;

export const revenueTransactionsQuery = z.object({
    from: isoDate,
    to: isoDate,
    search: z.string().trim().min(1).max(120).optional(),
    riderId: z.string().uuid().optional(),
    vehicleId: z.string().trim().min(1).max(60).optional(),
    type: z.enum(TXN_TYPES).optional(),
    method: z.enum(["upi", "card", "netbanking", "wallet", "cash", "other"]).optional(),
    paymentStatus: z.enum(["succeeded", "pending", "processing", "failed"]).optional(),
    refundStatus: z.enum(["pending", "processing", "succeeded", "failed", "rejected"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
    sortBy: z.enum(["date", "gross", "net"]).default("date"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
}).refine((v) => v.from <= v.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type RevenueTransactionsQuery = z.infer<typeof revenueTransactionsQuery>;

export const revenueExportQuery = revenueTransactionsQuery.and(
    z.object({ format: z.enum(["csv", "xlsx"]).default("csv") }),
);
export type RevenueExportQuery = z.infer<typeof revenueExportQuery>;
