import { describe, expect, it } from "vitest";
import {
    accountRefFromFilename, checkStatementArithmetic, parseAmount, parseDelimited, parseHdfcDate,
    parseHdfcStatement, readNarration, utrCandidates,
} from "../src/modules/reconciliation/hdfc.parser";

/**
 * Synthetic rows laid out exactly like a real HDFC NetBanking export (the
 * October 2026 statement this parser was built against): account details,
 * an asterisk separator, the header, rows, another separator, then the
 * STATEMENT SUMMARY block. Names and numbers are invented.
 */
function statementRows(override: { lastBalance?: string; summaryCredits?: string } = {}): string[][] {
    const blank = ["", "", "", "", "", "", ""];
    return [
        ["HDFC BANK Ltd.   Page No .:   1   Statement of accounts", "", "", "", "", "", ""],
        blank,
        ["M/S.    SAMPLE FLEET HUB", "", "", "", "Account Branch :SAMPLE BRANCH", "", ""],
        ["", "", "", "", "Account No :xxxxxxxxxxxx   OTHER", "", ""],
        ["Statement From  :  01/10/2026         To  :  31/10/2026", "", "", "", "A/C Open Date :23/09/2026", "", ""],
        ["*************", "", "", "", "", "", ""],
        ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
        ["********", "*****", "****", "****", "****", "****", "****"],
        ["05/10/26", "NEFT CR-UTIB0001506-RAZORPAY PAYMENTS PVT LTD PAYMENT AGGREGATOR ESCR-SAMPLE FLEET HUB-AXISCN0123456789", "AXISCN0123456789", "05/10/26", "", "1,000.00", "11,000.00"],
        ["29/10/26", "UPI-SAMPLE RIDER-RIDER@OKAXIS-UTIB0000168-123456789012-UPI", "000123456789012", "29/10/26", "", "3600", "14,600.00"],
        ["30/10/26", "NEFT DR-UTIB0000168-SAMPLE RIDER-NETBANK, MUM-HDFCH00000000-CUSTOMER EXCHANGE", "HDFCH00000000", "30/10/26", "7200", "", "7,400.00"],
        ["31/10/26", "UPI SETTLEMENT -KRM264- 31/10/26", "00000000000", "31/10/26", "", "510", override.lastBalance ?? "7,910.00"],
        blank,
        ["********", "", "", "", "", "", ""],
        ["STATEMENT SUMMARY  :-", "", "", "", "", "", ""],
        ["Opening Balance", "", "", "", "Debits", "Credits", "Closing Bal"],
        ["10,000.00", "", "", "", "7,200.00", override.summaryCredits ?? "5,110.00", "7,910.00"],
        blank,
        ["", "", "", "", "Dr Count", "Cr Count", ""],
        ["", "", "", "", "1", "3", ""],
        ["Generated On:", "02-Nov-2026 22:21", "", "", "", "", ""],
        ["---  End Of Statement ---", "", "", "", "", "", ""],
    ];
}

describe("parseHdfcStatement", () => {
    it("reads the period, every line and HDFC's own summary", () => {
        const s = parseHdfcStatement(statementRows(), "Acct Statement_4842_02112026_22.21.02.xls");
        expect(s.periodFrom).toBe("2026-10-01");
        expect(s.periodTo).toBe("2026-10-31");
        expect(s.accountRef).toBe("4842");
        expect(s.lines).toHaveLength(4);
        expect(s.lines[0]).toMatchObject({ txnDate: "2026-10-05", deposit: 1000, withdrawal: 0, balance: 11000, reference: "AXISCN0123456789" });
        expect(s.lines[2]).toMatchObject({ withdrawal: 7200, deposit: 0, balance: 7400 });
        expect(s.openingBalance).toBe(10000);
        expect(s.closingBalance).toBe(7910);
        expect(s.summary).toEqual({ debits: 7200, credits: 5110, drCount: 1, crCount: 3 });
        expect(checkStatementArithmetic(s)).toEqual([]);
    });

    it("rejects a file whose balances do not follow", () => {
        const s = parseHdfcStatement(statementRows({ lastBalance: "8,910.00" }));
        const problems = checkStatementArithmetic(s);
        expect(problems.some((p) => /Line 4/.test(p))).toBe(true);
    });

    it("rejects a file whose totals disagree with HDFC's summary", () => {
        const problems = checkStatementArithmetic(parseHdfcStatement(statementRows({ summaryCredits: "6,110.00" })));
        expect(problems.some((p) => /Deposits add up to 5110.00/.test(p))).toBe(true);
    });

    it("refuses something that is not an HDFC statement", () => {
        expect(() => parseHdfcStatement([["Name", "Amount"], ["A", "1"]])).toThrow(/HDFC account statement/);
    });
});

describe("readNarration", () => {
    it("recognises Razorpay settlements and keeps the UTR findable", () => {
        const n = "NEFT CR-UTIB0001506-RAZORPAY PAYMENTS PVT LTD PAYMENT AGGREGATOR ESCR-SAMPLE FLEET HUB-AXISCN0123456789";
        expect(readNarration(n, "bank_credit")).toMatchObject({ category: "razorpay_settlement", isRazorpay: true });
        expect(utrCandidates("AXISCN0123456789", n)).toContain("AXISCN0123456789");
    });

    it("names the counterparty of UPI and NEFT lines so a category can be learned", () => {
        expect(readNarration("UPI-SAMPLE RIDER-RIDER@OKAXIS-UTIB0000168-123456789012-UPI", "bank_credit"))
            .toEqual({ counterpartyKey: "SAMPLE RIDER", category: null, isRazorpay: false });
        expect(readNarration("NEFT DR-UTIB0000168-ATHER ENERGY LTD-NETBANK, MUM-HDFCH0-INV 9", "bank_debit").counterpartyKey)
            .toBe("ATHER ENERGY LTD");
    });

    it("categorises the narrations that decide themselves", () => {
        expect(readNarration("UPI SETTLEMENT -KRM264- 31/10/26", "bank_credit")).toMatchObject({
            counterpartyKey: "UPI SETTLEMENT KRM264", category: "upi_qr_settlement",
        });
        expect(readNarration("CASH DEPOSIT BY - SELF - MEDAVAKKAM", "bank_credit").category).toBe("cash_deposit");
        expect(readNarration("IB BILLPAY DR-HDFCAU-GST CPIN 26113300012345", "bank_debit").category).toBe("gst_payment");
    });
});

describe("helpers", () => {
    it("parses HDFC dates and Indian-grouped amounts", () => {
        expect(parseHdfcDate("05/10/26")).toBe("2026-10-05");
        expect(parseHdfcDate("31/02/26")).toBeNull();
        expect(parseAmount("1,23,456.70")).toBe(123456.7);
        expect(parseAmount("")).toBe(0);
    });

    it("takes the account's last four digits from HDFC's file name", () => {
        expect(accountRefFromFilename("Acct Statement_4842_02112026_22.21.02.xls")).toBe("4842");
        expect(accountRefFromFilename("statement.xls")).toBeNull();
    });

    it("reads the delimited export, quotes and all", () => {
        expect(parseDelimited('Date,Narration,Closing Balance\n05/10/26,"NEFT CR-A, B",1000\n')).toEqual([
            ["Date", "Narration", "Closing Balance"],
            ["05/10/26", "NEFT CR-A, B", "1000"],
        ]);
    });
});
