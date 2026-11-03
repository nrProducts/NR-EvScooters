/**
 * HDFC Bank account statement — the export NetBanking produces.
 *
 * Built against a real Swapngo Fleet Hub export (October 2026, .xls):
 *   • ~20 rows of account details (name, branch, "Account No :…",
 *     "Statement From : 01/10/2026 To : 31/10/2026") above the table;
 *   • a header row: Date | Narration | Chq./Ref.No. | Value Dt |
 *     Withdrawal Amt. | Deposit Amt. | Closing Balance;
 *   • rows of asterisks as separators; dates as dd/mm/yy;
 *   • a STATEMENT SUMMARY block: Opening Balance … Debits, Credits,
 *     Closing Bal, then Dr Count / Cr Count.
 * Everything here is pure — rows in, structured statement out — so it is
 * tested without a file and the file readers stay thin.
 */

export interface ParsedBankLine {
    txnDate: string;
    valueDate: string | null;
    narration: string;
    reference: string | null;
    withdrawal: number;
    deposit: number;
    balance: number;
}

export interface ParsedBankStatement {
    accountNumber: string | null;
    /** Last four digits of the account — all the app ever stores. */
    accountRef: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
    summary: { debits: number; credits: number; drCount: number; crCount: number } | null;
    lines: ParsedBankLine[];
}

const cellText = (v: unknown) => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** "1,23,456.70" → 123456.7; blank → 0. */
export function parseAmount(raw: unknown): number {
    const s = cellText(raw).replace(/,/g, "");
    if (!s) return 0;
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`"${cellText(raw)}" is not an amount.`);
    return Math.round(n * 100) / 100;
}

/** "05/10/26" or "05/10/2026" → "2026-10-05". */
export function parseHdfcDate(raw: unknown): string | null {
    const m = cellText(raw).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if (!m) return null;
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const month = m[2].padStart(2, "0");
    const day = m[1].padStart(2, "0");
    const iso = `${year}-${month}-${day}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

function findHeader(rows: unknown[][]): { index: number; cols: Record<string, number> } | null {
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].map((c) => cellText(c).toLowerCase());
        const col = (re: RegExp) => cells.findIndex((c) => re.test(c));
        const narration = col(/^narration/);
        const balance = col(/closing balance/);
        if (narration < 0 || balance < 0) continue;
        return {
            index: i,
            cols: {
                date: col(/^date$/),
                narration,
                reference: col(/chq|ref/),
                valueDate: col(/^value d/),
                withdrawal: col(/withdrawal/),
                deposit: col(/deposit/),
                balance,
            },
        };
    }
    return null;
}

/**
 * HDFC masks the account number inside the export ("Account No :xxxxxxxxxxxx")
 * but names the file after its last four digits: "Acct Statement_4842_02112026_22.21.02.xls".
 */
export function accountRefFromFilename(filename: string): string | null {
    return filename.match(/Acct\s*Statement[_\s-]*(\d{4})[_\s-]/i)?.[1] ?? null;
}

export function parseHdfcStatement(rows: unknown[][], filename = ""): ParsedBankStatement {
    const header = findHeader(rows);
    if (!header) {
        throw new Error("This does not look like an HDFC account statement: no row with Narration and Closing Balance columns.");
    }
    const { index, cols } = header;
    if (cols.date < 0 || cols.withdrawal < 0 || cols.deposit < 0) {
        throw new Error("The statement is missing its Date, Withdrawal or Deposit column.");
    }

    // --- details above the table -----------------------------------------
    const top = rows.slice(0, index).flat().map(cellText).join(" | ");
    const account = top.match(/Account No\s*:\s*([0-9Xx*]{6,20})/i)?.[1] ?? null;
    const digits = account?.replace(/\D/g, "") ?? "";
    const period = top.match(/Statement From\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*To\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);

    // --- the table ---------------------------------------------------------
    const lines: ParsedBankLine[] = [];
    let end = rows.length;
    for (let i = index + 1; i < rows.length; i++) {
        const row = rows[i];
        const first = cellText(row[0]);
        if (/statement summary/i.test(row.map(cellText).join(" "))) { end = i; break; }
        if (!row.some((c) => cellText(c))) continue;
        if (/^\*+$/.test(first)) continue;

        const date = parseHdfcDate(row[cols.date]);
        if (!date) {
            // A narration that wrapped onto its own row belongs to the line above.
            const extra = cellText(row[cols.narration]);
            if (extra && lines.length > 0 && !cellText(row[cols.balance])) {
                lines[lines.length - 1].narration += ` ${extra}`;
            }
            continue;
        }
        lines.push({
            txnDate: date,
            valueDate: cols.valueDate >= 0 ? parseHdfcDate(row[cols.valueDate]) : null,
            narration: cellText(row[cols.narration]),
            reference: cols.reference >= 0 ? cellText(row[cols.reference]) || null : null,
            withdrawal: parseAmount(row[cols.withdrawal]),
            deposit: parseAmount(row[cols.deposit]),
            balance: parseAmount(row[cols.balance]),
        });
    }

    // --- the summary block -------------------------------------------------
    let summary: ParsedBankStatement["summary"] = null;
    let opening: number | null = null;
    let closing: number | null = null;
    for (let i = end; i < rows.length; i++) {
        const cells = rows[i].map(cellText);
        if (/^opening balance$/i.test(cells[0] ?? "")) {
            const values = rows[i + 1]?.map(cellText) ?? [];
            const nums = values.filter((v) => v !== "").map(parseAmount);
            // Opening Balance | … | Debits | Credits | Closing Bal
            if (nums.length >= 4) {
                opening = nums[0];
                closing = nums[nums.length - 1];
                summary = { debits: nums[nums.length - 3], credits: nums[nums.length - 2], drCount: 0, crCount: 0 };
            }
        }
        if (cells.some((c) => /^dr count$/i.test(c)) && summary) {
            const counts = (rows[i + 1] ?? []).map(cellText).filter((v) => v !== "").map((v) => Number(v));
            if (counts.length >= 2) { summary.drCount = counts[0]; summary.crCount = counts[1]; }
        }
    }

    if (opening == null && lines.length > 0) {
        const f = lines[0];
        opening = Math.round((f.balance - f.deposit + f.withdrawal) * 100) / 100;
    }
    if (closing == null && lines.length > 0) closing = lines[lines.length - 1].balance;

    return {
        accountNumber: account,
        accountRef: digits.length >= 4 ? digits.slice(-4) : accountRefFromFilename(filename),
        periodFrom: period ? parseHdfcDate(period[1]) : lines[0]?.txnDate ?? null,
        periodTo: period ? parseHdfcDate(period[2]) : lines[lines.length - 1]?.txnDate ?? null,
        openingBalance: opening,
        closingBalance: closing,
        summary,
        lines,
    };
}

/**
 * The arithmetic a genuine statement satisfies. A file exported for the
 * wrong dates, cut short, or edited by hand fails one of these — and a
 * failed check rejects the whole import, naming the line and the amount.
 */
export function checkStatementArithmetic(s: ParsedBankStatement): string[] {
    const problems: string[] = [];
    const r2 = (n: number) => Math.round(n * 100) / 100;
    if (s.lines.length === 0) problems.push("The statement has no transactions.");

    let running = s.openingBalance ?? 0;
    s.lines.forEach((l, i) => {
        if (l.withdrawal > 0 && l.deposit > 0) {
            problems.push(`Line ${i + 1} (${l.txnDate}) has both a withdrawal and a deposit.`);
        }
        running = r2(running + l.deposit - l.withdrawal);
        if (Math.abs(running - l.balance) > 0.009) {
            problems.push(`Line ${i + 1} (${l.txnDate}): the balance should be ${running.toFixed(2)} but the statement says ${l.balance.toFixed(2)}.`);
            running = l.balance; // report each break once, not every line after it
        }
    });

    const debits = r2(s.lines.reduce((t, l) => t + l.withdrawal, 0));
    const credits = r2(s.lines.reduce((t, l) => t + l.deposit, 0));
    if (s.summary) {
        if (Math.abs(debits - s.summary.debits) > 0.009) problems.push(`Withdrawals add up to ${debits.toFixed(2)}; HDFC's summary says ${s.summary.debits.toFixed(2)}.`);
        if (Math.abs(credits - s.summary.credits) > 0.009) problems.push(`Deposits add up to ${credits.toFixed(2)}; HDFC's summary says ${s.summary.credits.toFixed(2)}.`);
        const dr = s.lines.filter((l) => l.withdrawal > 0).length;
        const cr = s.lines.filter((l) => l.deposit > 0).length;
        if (s.summary.drCount && dr !== s.summary.drCount) problems.push(`${dr} withdrawals read; HDFC's summary counts ${s.summary.drCount}.`);
        if (s.summary.crCount && cr !== s.summary.crCount) problems.push(`${cr} deposits read; HDFC's summary counts ${s.summary.crCount}.`);
    }
    if (s.openingBalance != null && s.closingBalance != null
        && Math.abs(r2(s.openingBalance + credits - debits) - s.closingBalance) > 0.009) {
        problems.push(`Opening ${s.openingBalance.toFixed(2)} + deposits − withdrawals does not equal the closing balance ${s.closingBalance.toFixed(2)}.`);
    }
    return problems;
}

export type BankCategory =
    | "razorpay_settlement" | "rider_payment_direct" | "upi_qr_settlement" | "cash_deposit" | "partner_capital"
    | "loan_received" | "other_income" | "vendor_refund" | "own_transfer_in"
    | "vehicle_purchase" | "battery_swap_partner" | "repairs_spares" | "insurance" | "rent" | "utilities"
    | "software_telematics" | "salaries" | "gst_payment" | "tds_payment" | "income_tax" | "rider_refund"
    | "partner_drawings" | "loan_repayment" | "bank_charges" | "own_transfer_out" | "other_expense";

export const MONEY_IN_CATEGORIES: BankCategory[] = [
    "razorpay_settlement", "rider_payment_direct", "upi_qr_settlement", "cash_deposit", "partner_capital",
    "loan_received", "other_income", "vendor_refund", "own_transfer_in",
];
export const MONEY_OUT_CATEGORIES: BankCategory[] = [
    "vehicle_purchase", "battery_swap_partner", "repairs_spares", "insurance", "rent", "utilities",
    "software_telematics", "salaries", "gst_payment", "tds_payment", "income_tax", "rider_refund",
    "partner_drawings", "loan_repayment", "bank_charges", "own_transfer_out", "other_expense",
];

/**
 * Who the money came from or went to, as a stable key a category can be
 * learned against, plus a category when the narration alone settles it.
 * Patterns are the ones in the real export (NEFT CR/DR, UPI, IMPS, UPI
 * SETTLEMENT) plus HDFC's usual cash, charge and tax narrations.
 */
export function readNarration(narration: string, kind: "bank_credit" | "bank_debit"): {
    counterpartyKey: string;
    category: BankCategory | null;
    isRazorpay: boolean;
} {
    const n = narration.toUpperCase().replace(/\s+/g, " ").trim();
    const parts = n.split("-").map((p) => p.trim());
    const tidy = (s: string | undefined) => (s ?? "").replace(/[^A-Z0-9 &.]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

    if (n.includes("RAZORPAY")) {
        return { counterpartyKey: "RAZORPAY", category: kind === "bank_credit" ? "razorpay_settlement" : null, isRazorpay: true };
    }
    if (/^UPI SETTLEMENT/.test(n)) {
        const merchant = n.match(/^UPI SETTLEMENT\s*-\s*([A-Z0-9]+)/)?.[1] ?? "";
        return { counterpartyKey: `UPI SETTLEMENT ${merchant}`.trim(), category: "upi_qr_settlement", isRazorpay: false };
    }
    if (/CASH DEP|BY CASH|CASH DEPOSIT/.test(n)) {
        return { counterpartyKey: "CASH DEPOSIT", category: kind === "bank_credit" ? "cash_deposit" : null, isRazorpay: false };
    }
    if (/\bGST\b.*(CPIN|CHALLAN)|CPIN/.test(n)) {
        return { counterpartyKey: "GST PAYMENT", category: kind === "bank_debit" ? "gst_payment" : null, isRazorpay: false };
    }
    if (/^(CHRG|CHARGES|SMS CHARGES|.*\bCHGS?\b)/.test(n) || /CHARGES? (INCL|FOR)/.test(n)) {
        return { counterpartyKey: "HDFC CHARGES", category: kind === "bank_debit" ? "bank_charges" : null, isRazorpay: false };
    }

    let party = "";
    if (/^NEFT (CR|DR)/.test(n) || /^RTGS (CR|DR)/.test(n)) party = parts[2];
    else if (/^UPI/.test(n)) party = parts[1];
    else if (/^IMPS/.test(n)) party = parts[2];
    else party = parts[0];

    return { counterpartyKey: tidy(party) || tidy(n), category: null, isRazorpay: false };
}

/** A UTR-looking token in the reference column or narration, for the Razorpay match. */
export function utrCandidates(reference: string | null, narration: string): string[] {
    const out = new Set<string>();
    if (reference) out.add(reference.trim().toUpperCase());
    for (const m of narration.toUpperCase().matchAll(/[A-Z]{4}[A-Z0-9]{8,18}/g)) out.add(m[0]);
    return [...out].filter((t) => t.length >= 10);
}

/** Minimal RFC 4180 reader for HDFC's delimited export. */
export function parseDelimited(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    const delimiter = (text.split(/\r?\n/).find((l) => /narration/i.test(l)) ?? "").includes("\t") ? "\t" : ",";
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delimiter) { row.push(cell); cell = ""; }
        else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
        else if (ch !== "\r") cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
}
