import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM.");
const money = z.coerce.number().min(0).max(100_000_000);

export const idParam = z.object({ id: z.string().uuid("A valid id is required.") });
export const billLineParams = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });
export const monthQuery = z.object({ month });
export const optionalMonthBody = z.object({ month: month.optional() });

export const vendorBody = z.object({
    name: z.string().trim().min(2).max(160),
    gstin: z.string().trim().max(15).nullish(),
    pan: z.string().trim().max(10).nullish(),
    stateCode: z.string().regex(/^\d{2}$/).nullish(),
    address: z.string().trim().max(400).nullish(),
    kind: z.enum(["goods", "services", "foreign_software", "landlord", "bank", "government", "other"]),
    defaultCategory: z.string().max(40).nullish(),
    contactEmail: z.string().trim().email().nullish().or(z.literal("")),
    contactPhone: z.string().trim().max(20).nullish(),
});
export type VendorBody = z.infer<typeof vendorBody>;

const billLine = z.object({
    description: z.string().trim().min(2).max(300),
    category: z.string().min(2).max(40),
    taxableAmount: money,
    gstRate: z.coerce.number().min(0).max(40),
    itcStatus: z.enum(["eligible", "blocked", "review", "ineligible"]).optional(),
    itcReason: z.string().trim().max(300).nullish(),
    isCapital: z.boolean().optional(),
    cgstAmount: money.optional(),
    sgstAmount: money.optional(),
    igstAmount: money.optional(),
});

export const billBody = z.object({
    vendorId: z.string().uuid("Choose a vendor."),
    billNumber: z.string().trim().min(1).max(40),
    billDate: isoDate,
    itcMonth: isoDate.nullish(),
    isReverseCharge: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullish(),
    lines: z.array(billLine).min(1, "Add at least one line.").max(50),
});
export type BillBody = z.infer<typeof billBody>;

export const listBillsQuery = z
    .object({
        from: isoDate,
        to: isoDate,
        status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
        vendorId: z.string().uuid().optional(),
        search: z.string().trim().max(60).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    })
    .refine((q) => q.from <= q.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type ListBillsQuery = z.infer<typeof listBillsQuery>;

export const vendorsQuery = z.object({ search: z.string().trim().max(60).optional() });

export const cancelBody = z.object({ reason: z.string().trim().min(5, "Say why the bill is cancelled.").max(300) });
export const linkPaymentBody = z.object({ bankLineId: z.string().uuid() });
export const assetsQuery = z.object({ rate: z.coerce.number().min(0).max(100).default(15) });
export const vehicleCostBody = z.object({
    billLineId: z.string().uuid().nullable(),
    cost: money,
    purchasedOn: isoDate.nullish(),
});
