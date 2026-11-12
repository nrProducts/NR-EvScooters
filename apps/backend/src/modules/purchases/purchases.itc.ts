/**
 * What a purchase category means for input tax credit — the default a bill
 * line takes, which anyone with `purchases.edit` may override with a reason.
 * "review" lines are not claimed until someone decides, which keeps the
 * advocate's open questions (spare parts, battery-swap services) safe by
 * default. Basis is the CGST Act section each block rests on.
 */

export type ItcStatus = "eligible" | "blocked" | "review" | "ineligible";

export interface PurchaseCategory {
    code: string;
    label: string;
    itc: ItcStatus;
    basis: string;
    capital?: boolean;
}

export const PURCHASE_CATEGORIES: PurchaseCategory[] = [
    { code: "vehicle_purchase", label: "Scooter purchase (RTO-registered)", itc: "blocked", basis: "s. 17(5)(a) — motor vehicle; GST is added to the asset's cost", capital: true },
    { code: "vehicle_insurance", label: "Scooter insurance", itc: "blocked", basis: "s. 17(5)(ab)" },
    { code: "vehicle_repairs", label: "Scooter servicing and repairs", itc: "blocked", basis: "s. 17(5)(ab)" },
    { code: "spare_parts", label: "Spare parts bought as goods", itc: "review", basis: "Advocate question 7 — not claimed until decided" },
    { code: "battery_swap_service", label: "Battery-swap service", itc: "review", basis: "Advocate question 7 — not claimed until decided" },
    { code: "razorpay_fees", label: "Payment gateway fees", itc: "eligible", basis: "s. 16 — in the course of business" },
    { code: "bank_charges", label: "Bank charges", itc: "eligible", basis: "s. 16" },
    { code: "software_telematics", label: "Software, telematics and SMS (Indian supplier)", itc: "eligible", basis: "s. 16" },
    { code: "foreign_software", label: "Overseas software and hosting (reverse charge)", itc: "eligible", basis: "Import of services: IGST paid under reverse charge, claimed back the same month" },
    { code: "rent", label: "Hub and office rent", itc: "eligible", basis: "s. 16" },
    { code: "professional_fees", label: "CA, advocate and professional fees", itc: "eligible", basis: "s. 16" },
    { code: "utilities", label: "Electricity, internet, phone", itc: "eligible", basis: "s. 16" },
    { code: "office_expenses", label: "Office and shop expenses (stationery, cleaning, small items)", itc: "eligible", basis: "s. 16" },
    { code: "office_equipment", label: "Laptops, furniture, tools", itc: "eligible", basis: "s. 16 — capital goods", capital: true },
    { code: "civil_works", label: "Hub civil works and construction", itc: "blocked", basis: "s. 17(5)(c)/(d)" },
    { code: "food_staff_welfare", label: "Food, staff welfare, gifts", itc: "blocked", basis: "s. 17(5)(b) and (h)" },
    { code: "salaries", label: "Salaries and staff payments", itc: "ineligible", basis: "No GST on salaries" },
    { code: "no_gst", label: "No GST charged (exempt supplies)", itc: "ineligible", basis: "Nothing to claim" },
    { code: "other", label: "Other", itc: "review", basis: "Decide before claiming" },
];

const BY_CODE = new Map(PURCHASE_CATEGORIES.map((c) => [c.code, c]));
export const categoryOf = (code: string) => BY_CODE.get(code) ?? null;

export const SWAPNGO_STATE = "33";

/**
 * Splits a line's GST into heads. An inter-state supply (supplier state ≠
 * Tamil Nadu) is IGST; intra-state is CGST + SGST. Reverse charge: the
 * supplier charged no GST, so the bill carries none — Swapngo's own IGST
 * liability is computed separately from `gst_rate`. Pure — exported for tests.
 */
export function splitPurchaseTax(
    taxable: number, rate: number, opts: { supplierState: string | null; reverseCharge: boolean },
): { cgst: number; sgst: number; igst: number } {
    if (opts.reverseCharge || rate === 0) return { cgst: 0, sgst: 0, igst: 0 };
    const tax = Math.round(taxable * rate) / 100;
    if (opts.supplierState && opts.supplierState !== SWAPNGO_STATE) return { cgst: 0, sgst: 0, igst: tax };
    const cgst = Math.trunc((tax / 2) * 100) / 100;
    return { cgst, sgst: Math.round((tax - cgst) * 100) / 100, igst: 0 };
}

/** Reverse-charge IGST Swapngo owes on a line. Pure — exported for tests. */
export const reverseChargeIgst = (taxable: number, rate: number) => Math.round(taxable * rate) / 100;
