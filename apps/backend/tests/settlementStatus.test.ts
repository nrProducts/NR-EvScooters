import { describe, expect, it } from "vitest";
import { toStatus } from "../src/modules/returns/returns.service";

describe("toStatus", () => {
    it("reports amount_due regardless of any refund state", () => {
        expect(toStatus("amount_due", null)).toBe("amount_due");
        expect(toStatus("amount_due", "succeeded")).toBe("amount_due");
    });

    it("reports settlement_completed for a balanced settlement — nothing owed either way", () => {
        expect(toStatus("balanced", null)).toBe("settlement_completed");
    });

    it("reports pending_refund, not no_refund_required, when a refund is due but not yet created", () => {
        // The bug: outcome='refund_due' can only reach here when nothing has
        // created the refund row yet. Reporting "no refund required" told the
        // rider their money wasn't coming when it was actually just waiting
        // on staff approval.
        expect(toStatus("refund_due", null)).toBe("pending_refund");
    });

    it("reports refund_completed once the refund has succeeded", () => {
        expect(toStatus("refund_due", "succeeded")).toBe("refund_completed");
    });

    it("reports refund_processing while the gateway has accepted but not settled it", () => {
        expect(toStatus("refund_due", "processing")).toBe("refund_processing");
    });

    it("reports pending_refund for any other in-flight refund status", () => {
        expect(toStatus("refund_due", "pending")).toBe("pending_refund");
        expect(toStatus("refund_due", "failed")).toBe("pending_refund");
    });
});
