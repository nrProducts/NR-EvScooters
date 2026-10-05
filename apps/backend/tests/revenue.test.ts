import { describe, expect, it } from "vitest";
import {
    computeFromWindow, classifyItem, renderRevenueCsv, renderRevenueXlsx,
    type WindowData, type AllocRow, type ItemRow, type RefundRow,
} from "../src/modules/revenue/revenue.service";
import type { RevenueSummary } from "../src/modules/revenue/revenue.types";

/**
 * These exercise the pure revenue engine (`computeFromWindow`) over a
 * hand-built window — the same function every /revenue endpoint and the
 * dashboard Revenue Overview project from, so this is where the money rules
 * are pinned.
 */

const FROM = "2026-09-01";
const TO = "2026-09-30";
const AT = "2026-09-10T08:00:00+05:30";

function emptyWindow(): WindowData {
    return {
        from: FROM, to: TO,
        allocs: [],
        itemsByInvoice: new Map(),
        seqByPeriod: new Map(),
        adjById: new Map(),
        riderNameById: new Map(),
        vehicleBySubscription: new Map(),
        bookingBySubscription: new Map(),
        refundsInWindow: [],
        refundsCompleted: [],
        depositsCollected: [],
        depositsForfeitedInWindow: [],
        depositHeldTotal: 0,
        settlements: [],
        pendingRefundCount: 0,
    };
}

function alloc(over: Partial<AllocRow> & { invoiceId: string; amount: number; invoiceTotal: number }): AllocRow {
    return {
        txnId: `txn-${over.invoiceId}`,
        gatewayPaymentId: `pay_${over.invoiceId}`,
        method: "upi",
        capturedAt: AT,
        payerId: "rider-1",
        invoiceStatus: "issued",
        invoicePurpose: "subscription_period",
        subscriptionId: "sub-1",
        periodId: "period-1",
        riderId: "rider-1",
        ...over,
    };
}

function item(over: Partial<ItemRow> & { invoiceId: string; itemType: ItemRow["itemType"]; amount: number }): ItemRow {
    return { description: "", adjustmentId: null, ...over };
}

function refund(over: Partial<RefundRow> & { reason: string; amount: number }): RefundRow {
    return {
        id: `rf-${Math.random()}`,
        userId: "rider-1",
        grossAmount: over.amount,
        status: "succeeded",
        initiatedAt: AT,
        completedAt: AT,
        ...over,
    };
}

describe("revenue engine — gross / net / deposits", () => {
    it("excludes the deposit line from Gross Revenue and nets discounts down", () => {
        const w = emptyWindow();
        // Invoice: plan 1000 + deposit 2000 + discount -100 = total 2900, fully paid.
        w.allocs = [alloc({ invoiceId: "inv-1", amount: 2900, invoiceTotal: 2900 })];
        w.itemsByInvoice.set("inv-1", [
            item({ invoiceId: "inv-1", itemType: "plan_fee", amount: 1000 }),
            item({ invoiceId: "inv-1", itemType: "deposit", amount: 2000 }),
            item({ invoiceId: "inv-1", itemType: "adjustment", amount: -100, description: "Welcome discount" }),
        ]);
        w.seqByPeriod.set("period-1", 1);

        const r = computeFromWindow(w);
        expect(r.figures.gross).toBe(900);     // 1000 − 100, deposit excluded
        expect(r.figures.net).toBe(900);       // no refunds
        expect(r.byType.get("rental")?.amount).toBe(1000);
        expect(r.byType.get("discount")?.amount).toBe(-100);
    });

    it("only booking_cancellation / goodwill refunds reduce Net Revenue", () => {
        const w = emptyWindow();
        w.allocs = [alloc({ invoiceId: "inv-1", amount: 1000, invoiceTotal: 1000 })];
        w.itemsByInvoice.set("inv-1", [item({ invoiceId: "inv-1", itemType: "plan_fee", amount: 1000 })]);
        w.seqByPeriod.set("period-1", 1);
        w.refundsCompleted = [
            refund({ reason: "booking_cancellation", amount: 300 }),
            refund({ reason: "goodwill", amount: 100 }),
            refund({ reason: "deposit_release", amount: 2000 }),   // NOT revenue
            refund({ reason: "settlement", amount: 500 }),         // NOT revenue
        ];

        const r = computeFromWindow(w);
        expect(r.figures.gross).toBe(1000);
        expect(r.figures.refunds).toBe(400);   // 300 + 100 only
        expect(r.figures.net).toBe(600);
        expect(r.deposits.refunded).toBe(2500); // deposit_release + settlement
    });

    it("splits a partial payment proportionally by item type", () => {
        const w = emptyWindow();
        // total 2000 (plan 1000 + deposit 1000); only 1000 paid so far.
        w.allocs = [alloc({ invoiceId: "inv-1", amount: 1000, invoiceTotal: 2000 })];
        w.itemsByInvoice.set("inv-1", [
            item({ invoiceId: "inv-1", itemType: "plan_fee", amount: 1000 }),
            item({ invoiceId: "inv-1", itemType: "deposit", amount: 1000 }),
        ]);
        w.seqByPeriod.set("period-1", 1);

        const r = computeFromWindow(w);
        expect(r.figures.gross).toBe(500); // half of the 1000 payment is the plan share
    });

    it("classifies renewal vs new by period sequence_number", () => {
        const w = emptyWindow();
        w.allocs = [
            alloc({ invoiceId: "inv-new", amount: 1000, invoiceTotal: 1000, periodId: "p1" }),
            alloc({ invoiceId: "inv-ren", amount: 1000, invoiceTotal: 1000, periodId: "p2" }),
        ];
        w.itemsByInvoice.set("inv-new", [item({ invoiceId: "inv-new", itemType: "plan_fee", amount: 1000 })]);
        w.itemsByInvoice.set("inv-ren", [item({ invoiceId: "inv-ren", itemType: "plan_fee", amount: 1000 })]);
        w.seqByPeriod.set("p1", 1);
        w.seqByPeriod.set("p2", 4);

        const r = computeFromWindow(w);
        expect(r.byType.get("rental")?.amount).toBe(1000);
        expect(r.byType.get("renewal")?.amount).toBe(1000);
    });

    it("Deposits: Collected / Refunded / Adjusted, Held is point-in-time", () => {
        const w = emptyWindow();
        w.depositsCollected = [{ subscriptionId: "s1", amount: 2000 }, { subscriptionId: "s2", amount: 2000 }];
        w.depositHeldTotal = 3500;
        w.refundsCompleted = [refund({ reason: "deposit_release", amount: 2000 })];
        w.settlements = [
            { depositSnapshot: 2000, totalCharges: 500, lateFee: 500, damage: 0, other: 0, settledAt: AT },
        ];
        const r = computeFromWindow(w);
        expect(r.deposits.collected).toBe(4000);
        expect(r.deposits.refunded).toBe(2000);
        expect(r.deposits.adjusted).toBe(500); // min(charges 500, deposit 2000)
        expect(r.deposits.held).toBe(3500);
    });

    it("by-method sums to gross (revenue only, deposit cash-in kept aside)", () => {
        const w = emptyWindow();
        w.allocs = [
            alloc({ invoiceId: "a", amount: 1500, invoiceTotal: 1500, method: "upi" }),
            alloc({ invoiceId: "b", amount: 500, invoiceTotal: 500, method: "cash" }),
        ];
        w.itemsByInvoice.set("a", [
            item({ invoiceId: "a", itemType: "plan_fee", amount: 1000 }),
            item({ invoiceId: "a", itemType: "deposit", amount: 500 }),
        ]);
        w.itemsByInvoice.set("b", [item({ invoiceId: "b", itemType: "plan_fee", amount: 500 })]);
        w.seqByPeriod.set("period-1", 1);

        const r = computeFromWindow(w);
        const methodTotal = [...r.byMethod.entries()]
            .filter(([k]) => k !== "__deposit__")
            .reduce((s, [, v]) => s + v.amount, 0);
        expect(Math.round(methodTotal)).toBe(r.figures.gross);
        expect(r.figures.gross).toBe(1500); // 1000 (plan share of a) + 500 (b)
    });
});

describe("export renderers", () => {
    const summary: RevenueSummary = {
        range: { from: FROM, to: TO },
        gross: 9730, refunds: 0, net: 9730, lateFees: 1350, additionalCharges: 100, damageCharges: 0,
        deposits: { collected: 10000, refunded: 0, adjusted: 0, held: 10000 },
        pendingRefunds: 0,
    };
    const rows = [
        {
            id: "pay_abc", kind: "payment" as const, bookingId: "bk-1", riderName: "Kavi", riderId: "u1",
            vehicleNumber: "TN22AB0001", date: "2026-09-10T08:00:00+05:30", type: "rental_payment" as const,
            method: "upi", gross: 1645, refund: 0, deposit: 2000, lateFee: 0, additionalCharge: 25,
            net: 1645, paymentStatus: "succeeded", refundStatus: null,
        },
    ];

    it("CSV starts with a UTF-8 BOM and has no mojibake glyphs", () => {
        const buf = renderRevenueCsv(summary, rows, { from: FROM, to: TO, page: 1, pageSize: 20, sortBy: "date", sortDir: "desc" });
        expect(buf[0]).toBe(0xef);
        expect(buf[1]).toBe(0xbb);
        expect(buf[2]).toBe(0xbf);
        const text = buf.toString("utf-8");
        expect(text).toContain("SwapNgo Revenue Report");
        expect(text).toContain("Kavi");
        expect(text).not.toMatch(/[—–·₹]/); // all replaced for Excel's codepage
    });

    it("XLSX renders a non-trivial workbook", async () => {
        const buf = await renderRevenueXlsx(summary, rows, { from: FROM, to: TO, page: 1, pageSize: 20, sortBy: "date", sortDir: "desc" });
        expect(buf.byteLength).toBeGreaterThan(2000);
        // zip magic — a real .xlsx is a zip
        expect(buf[0]).toBe(0x50);
        expect(buf[1]).toBe(0x4b);
    });
});

describe("classifyItem", () => {
    const w = emptyWindow();
    w.seqByPeriod.set("period-1", 1);
    const a = alloc({ invoiceId: "i", amount: 1, invoiceTotal: 1 });

    it("late fee by adjustment code", () => {
        w.adjById.set("adj-lf", { code: "late_fee", damageId: null, kind: "charge" });
        expect(classifyItem(item({ invoiceId: "i", itemType: "adjustment", amount: 450, adjustmentId: "adj-lf" }), a, w))
            .toBe("late_fee");
    });
    it("damage by adjustment damage_id", () => {
        w.adjById.set("adj-dmg", { code: "damage_charge", damageId: "dmg-1", kind: "charge" });
        expect(classifyItem(item({ invoiceId: "i", itemType: "adjustment", amount: 800, adjustmentId: "adj-dmg" }), a, w))
            .toBe("damage");
    });
    it("adhoc late fee by description", () => {
        expect(classifyItem(item({ invoiceId: "i", itemType: "adjustment", amount: 200, description: "Overdue plan renewal — late fee" }), a, w))
            .toBe("late_fee");
    });
    it("negative adjustment is a discount", () => {
        expect(classifyItem(item({ invoiceId: "i", itemType: "adjustment", amount: -50 }), a, w)).toBe("discount");
    });
});
