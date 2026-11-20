/**
 * The money rule for damage recorded when a maintenance ticket is resolved.
 *
 * Pure and exported so a test exercises exactly what production runs — same
 * reason computeDamageDeduction lives in damages.service.ts.
 *
 * Staff enter each damaged part's price BEFORE GST, plus one GST rate for the
 * whole charge. The rider is billed `subtotal + GST`.
 *
 * ── Why the invoice lines already carry their GST ────────────────────────
 * Every rider invoice is treated as GST-INCLUSIVE by the tax-document engine
 * (gst_inclusive_split in 20261110100000_gst_tax_documents.sql): it back-
 * calculates tax out of each non-deposit line's `amount`. A separate "GST
 * 18%" line would therefore be taxed AGAIN. So the GST is folded into the
 * part lines instead — each line is that part's price plus its share of GST —
 * and the lines add up to the total exactly (the last one absorbs the
 * rounding), which is also what the rider reads on their bill.
 */

export interface DamageItemInput {
    part: string;
    notes?: string | null;
    /** Price of this part before GST. */
    amount: number;
}

/** What is stored on the ticket (and shown in vehicle history). */
export interface StoredDamageItem {
    part: string;
    notes: string | null;
    /** Before GST. */
    amount: number;
}

export interface DamageInvoiceLine {
    description: string;
    /** GST-inclusive. */
    amount: number;
}

export interface DamageChargeBreakdown {
    items: StoredDamageItem[];
    gst_rate: number;
    subtotal: number;
    gst_amount: number;
    total: number;
    lines: DamageInvoiceLine[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * `labelPrefix` starts each invoice line's description. Damage charges use the
 * default; a rider's free-form Add Charge passes "" so the line reads as typed.
 */
export function computeDamageCharge(
    items: DamageItemInput[],
    gstRate: number,
    labelPrefix = "Damage: ",
): DamageChargeBreakdown {
    const rate = round2(Math.max(0, gstRate));
    const stored: StoredDamageItem[] = items.map((i) => ({
        part: i.part.trim(),
        notes: i.notes?.trim() ? i.notes.trim() : null,
        amount: round2(i.amount),
    }));

    const subtotal = round2(stored.reduce((sum, i) => sum + i.amount, 0));
    const gstAmount = round2((subtotal * rate) / 100);
    const total = round2(subtotal + gstAmount);

    let allocated = 0;
    const lines: DamageInvoiceLine[] = stored.map((item, index) => {
        const last = index === stored.length - 1;
        const gross = last ? round2(total - allocated) : round2(item.amount * (1 + rate / 100));
        allocated = round2(allocated + gross);
        const label = `${labelPrefix}${item.part}`;
        return { description: rate > 0 ? `${label} (incl. ${rate}% GST)` : label, amount: gross };
    });

    return { items: stored, gst_rate: rate, subtotal, gst_amount: gstAmount, total, lines };
}
