import PDFDocument from "pdfkit";
import type { GstProfileRow, TaxDocumentRow } from "./gst.types";

/**
 * Renders one tax invoice or credit note as an A4 PDF.
 *
 * Drawn fresh from the stored row every time rather than cached: the row is
 * append-only, so the same document always renders the same PDF, and there is
 * no second copy to drift from the register.
 *
 * Fonts are pdfkit's built-in Helvetica, which has no ₹ glyph — amounts are
 * labelled INR instead, which is also how most Indian tax invoices print them.
 * Everything Rule 46 asks for is here: supplier name, address and GSTIN; a
 * serial number of 16 characters or fewer; date; recipient; SAC; taxable value;
 * rate and amount of CGST and SGST; place of supply; reverse-charge status.
 */

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 in points
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = "#111111";
const MUTED = "#555555";
const RULE = "#BBBBBB";

const money = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-02" → "02 Nov 2026" — the stored value is already an IST calendar date. */
export function formatDocDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

const ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
    if (n < 20) return ONES[n];
    return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return [h ? `${ONES[h]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Whole rupees in the Indian system — lakh and crore, not million. */
function wholeInWords(n: number): string {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${wholeInWords(crore)} Crore`);
    if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
    if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
    if (rest) parts.push(belowThousand(rest));
    return parts.join(" ");
}

/** "Indian Rupees Two Thousand Six Hundred and Paise Fifty Only". Exported for tests. */
export function amountInWords(amount: number): string {
    const paiseTotal = Math.round(amount * 100);
    const rupees = Math.floor(paiseTotal / 100);
    const paise = paiseTotal % 100;
    const words = `Indian Rupees ${wholeInWords(rupees)}`;
    return paise ? `${words} and Paise ${belowHundred(paise)} Only` : `${words} Only`;
}

interface Column { label: string; width: number; align: "left" | "right" }

export async function renderTaxDocumentPdf(doc: TaxDocumentRow, seller: GstProfileRow): Promise<Buffer> {
    const pdf = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: doc.docNumber, Author: seller.legalName } });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
    });

    const isCredit = doc.docType === "credit_note";
    const halfRate = doc.gstRate / 2;

    // --- heading -----------------------------------------------------------
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(16)
        .text(isCredit ? "CREDIT NOTE" : "TAX INVOICE", MARGIN, MARGIN);
    pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Original for recipient");

    const sellerTop = MARGIN;
    pdf.fillColor(INK).font("Helvetica-Bold").fontSize(11)
        .text(seller.legalName, MARGIN + CONTENT_WIDTH / 2, sellerTop, { width: CONTENT_WIDTH / 2, align: "right" });
    pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED)
        .text(`GSTIN ${seller.gstin}`, { width: CONTENT_WIDTH / 2, align: "right" })
        .text(seller.address, { width: CONTENT_WIDTH / 2, align: "right" })
        .text(`State: ${seller.stateName} (${seller.stateCode})`, { width: CONTENT_WIDTH / 2, align: "right" });

    let y = Math.max(pdf.y, MARGIN + 60) + 10;
    pdf.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1.2).strokeColor(INK).stroke();
    y += 10;

    // --- document facts ----------------------------------------------------
    const facts: [string, string][] = [
        [isCredit ? "Credit note no." : "Invoice no.", doc.docNumber],
        ["Date", formatDocDate(doc.issuedOn)],
        ["Place of supply", `${seller.stateName} (${doc.placeOfSupply})`],
        ["Reverse charge", "No"],
    ];
    if (doc.supplyDate !== doc.issuedOn) facts.splice(2, 0, ["Date of supply", formatDocDate(doc.supplyDate)]);
    if (isCredit && doc.originalDocNumber) facts.push(["Against tax invoice", doc.originalDocNumber]);
    if (!isCredit && doc.billNumber) facts.push(["Bill reference", doc.billNumber]);

    const colW = CONTENT_WIDTH / 2;
    const factsTop = y;
    facts.forEach(([k, v], i) => {
        const rowY = factsTop + i * 14;
        pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(k, MARGIN, rowY, { width: 95 });
        pdf.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(v, MARGIN + 95, rowY, { width: colW - 100 });
    });

    pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Bill to", MARGIN + colW, factsTop);
    pdf.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(doc.recipientName, MARGIN + colW, factsTop + 13, { width: colW });
    pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED)
        .text("Unregistered (B2C)", MARGIN + colW, pdf.y + 1, { width: colW })
        .text(`State: ${seller.stateName} (${doc.placeOfSupply})`, { width: colW });

    y = Math.max(factsTop + facts.length * 14, pdf.y) + 14;

    // --- lines -------------------------------------------------------------
    const cols: Column[] = [
        { label: "#", width: 18, align: "left" },
        { label: "Description", width: 187, align: "left" },
        { label: "SAC", width: 38, align: "left" },
        { label: "Taxable (INR)", width: 68, align: "right" },
        { label: `CGST ${halfRate}%`, width: 56, align: "right" },
        { label: `SGST ${halfRate}%`, width: 56, align: "right" },
        { label: "Amount (INR)", width: CONTENT_WIDTH - 18 - 187 - 38 - 68 - 56 - 56, align: "right" },
    ];

    const drawRow = (values: string[], rowY: number, bold = false): number => {
        let x = MARGIN;
        let tallest = 0;
        pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(INK);
        values.forEach((v, i) => {
            const c = cols[i];
            const h = pdf.heightOfString(v, { width: c.width - 6 });
            pdf.text(v, x + 3, rowY, { width: c.width - 6, align: c.align });
            tallest = Math.max(tallest, h);
            x += c.width;
        });
        return rowY + tallest + 6;
    };

    pdf.rect(MARGIN, y - 4, CONTENT_WIDTH, 18).fillColor("#EEEEEE").fill();
    y = drawRow(cols.map((c) => c.label), y, true);
    doc.lines.forEach((line, i) => {
        y = drawRow([
            String(i + 1), line.description, line.sac,
            money(line.taxable), money(line.cgst), money(line.sgst), money(line.gross),
        ], y);
        pdf.moveTo(MARGIN, y - 3).lineTo(MARGIN + CONTENT_WIDTH, y - 3).lineWidth(0.5).strokeColor(RULE).stroke();
    });

    pdf.moveTo(MARGIN, y - 3).lineTo(MARGIN + CONTENT_WIDTH, y - 3).lineWidth(1.2).strokeColor(INK).stroke();
    y = drawRow([
        "", "Total", "", money(doc.taxableAmount), money(doc.cgstAmount), money(doc.sgstAmount), money(doc.totalAmount),
    ], y + 2, true);

    y += 6;
    pdf.font("Helvetica").fontSize(8.5).fillColor(MUTED).text("Amount in words", MARGIN, y);
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(amountInWords(doc.totalAmount), MARGIN, pdf.y + 1, {
        width: CONTENT_WIDTH,
    });

    // --- footer ------------------------------------------------------------
    y = pdf.y + 18;
    pdf.font("Helvetica").fontSize(8).fillColor(MUTED);
    const notes = isCredit
        ? [
            "This credit note reduces the value of the tax invoice named above by the amount refunded to you.",
            "Prices are inclusive of GST.",
        ]
        : [
            "Prices are inclusive of GST. A refundable security deposit, where collected, is not a supply and is not part of the taxable value.",
        ];
    notes.forEach((n) => {
        pdf.text(n, MARGIN, y, { width: CONTENT_WIDTH });
        y = pdf.y + 3;
    });

    y += 18;
    pdf.font("Helvetica-Bold").fontSize(9).fillColor(INK)
        .text(`For ${seller.legalName}`, MARGIN + CONTENT_WIDTH / 2, y, { width: CONTENT_WIDTH / 2, align: "right" });
    pdf.font("Helvetica").fontSize(8).fillColor(MUTED)
        .text("Authorised signatory", MARGIN + CONTENT_WIDTH / 2, pdf.y + 22, { width: CONTENT_WIDTH / 2, align: "right" })
        .text("This is a computer-generated document.", MARGIN, pdf.y + 10, { width: CONTENT_WIDTH, align: "center" });

    pdf.end();
    return done;
}
