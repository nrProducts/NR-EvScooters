export type TaxDocumentType = "tax_invoice" | "credit_note";
export type TaxDocumentSource = "invoice_paid" | "invoice_unpaid_30d" | "deposit_retained" | "refund";
export type TaxDocumentStatus = "issued" | "cancelled";

/** One frozen line of a tax document, as `tax_documents.lines` stores it. */
export interface TaxDocumentLine {
    description: string;
    sac: string;
    /** GST-inclusive amount — what the rider paid for this line. */
    gross: number;
    taxable: number;
    cgst: number;
    sgst: number;
}

export interface TaxDocumentRow {
    id: string;
    docType: TaxDocumentType;
    source: TaxDocumentSource;
    docNumber: string;
    supplyDate: string;
    issuedOn: string;
    userId: string;
    recipientName: string;
    invoiceId: string | null;
    /** The bill (`invoices.invoice_number`) this tax invoice was raised for. */
    billNumber: string | null;
    rentalId: string | null;
    refundId: string | null;
    originalDocumentId: string | null;
    originalDocNumber: string | null;
    placeOfSupply: string;
    sacCode: string;
    gstRate: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalAmount: number;
    status: TaxDocumentStatus;
    lines: TaxDocumentLine[];
    createdAt: string;
    /** First day of the GSTR-1 month this document is reported in. */
    returnPeriod: string;
}

export interface TaxDocumentTotals {
    count: number;
    taxable: number;
    cgst: number;
    sgst: number;
    total: number;
    firstNumber: string | null;
    lastNumber: string | null;
}

/** What the register screen and the GSTR-1 hand-off need for a range. */
export interface TaxDocumentSummary {
    from: string;
    to: string;
    taxInvoices: TaxDocumentTotals;
    creditNotes: TaxDocumentTotals;
    /** Tax invoices less credit notes — the figure GSTR-1 Table 7 and GSTR-3B 3.1(a) report. */
    net: { taxable: number; cgst: number; sgst: number; total: number };
    cancelledCount: number;
}

export interface ListTaxDocumentsFilters {
    from: string;
    to: string;
    docType?: TaxDocumentType;
    source?: TaxDocumentSource;
    search?: string;
    page: number;
    pageSize: number;
}

export interface GstProfileRow {
    id: string;
    effectiveFrom: string;
    legalName: string;
    tradeName: string | null;
    gstin: string;
    stateCode: string;
    stateName: string;
    address: string;
    sacCode: string;
    gstRate: number;
    createdAt: string;
    /** True once any document was issued under it — it is then frozen. */
    inUse: boolean;
    /** The profile in force today. */
    isCurrent: boolean;
}

export interface CreateGstProfileInput {
    effectiveFrom: string;
    legalName: string;
    tradeName?: string | null;
    gstin: string;
    stateName: string;
    address: string;
    sacCode: string;
    gstRate: number;
}

/** What still needs a document, from pending_tax_documents(). */
export interface PendingTaxDocuments {
    total: number;
    byKind: { paid: number; unpaid: number; kept: number; refund: number };
    recentFailures: { at: string; entityType: string; entityId: string; error: string }[];
}
