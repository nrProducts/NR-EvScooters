import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM.");

export const reconciliationQuery = z.object({
    from: isoDate,
    to: isoDate,
});

export type ReconciliationQuery = z.infer<typeof reconciliationQuery>;

export const idParam = z.object({ id: z.string().uuid("A valid id is required.") });

export const listStatementsQuery = z
    .object({
        source: z.enum(["razorpay", "hdfc"]).default("razorpay"),
        from: isoDate,
        to: isoDate,
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    })
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type ListStatementsQuery = z.infer<typeof listStatementsQuery>;

export const monthQuery = z.object({ month });
export type MonthQuery = z.infer<typeof monthQuery>;

export const listExceptionsQuery = z.object({
    status: z.enum(["open", "resolved"]).default("open"),
    code: z.string().regex(/^[EB]\d{1,2}$/).optional(),
    source: z.enum(["razorpay", "hdfc"]).optional(),
});
export type ListExceptionsQuery = z.infer<typeof listExceptionsQuery>;

export const resolveExceptionBody = z.object({
    action: z.enum(["resolve", "ignore"]).default("resolve"),
    note: z.string().trim().min(5, "Say what was checked or done (at least 5 characters).").max(500),
});
export type ResolveExceptionBody = z.infer<typeof resolveExceptionBody>;

export const bankLinesQuery = z
    .object({
        from: isoDate,
        to: isoDate,
        filter: z.enum(["all", "uncategorised", "exceptions"]).default("all"),
        category: z.string().max(40).optional(),
        search: z.string().trim().max(80).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    })
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type BankLinesQuery = z.infer<typeof bankLinesQuery>;

export const categoriseBody = z.object({
    category: z.string().min(2).max(40),
    applyToCounterparty: z.boolean().default(false),
});
export type CategoriseBody = z.infer<typeof categoriseBody>;

export const syncBody = z
    .object({ from: isoDate, to: isoDate })
    .refine((b) => b.from <= b.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type SyncBody = z.infer<typeof syncBody>;
