import { describe, expect, it } from "vitest";
import { computeDamageCharge } from "../src/modules/maintenance/maintenance.damageCharge";

/**
 * The charge staff raise when resolving a maintenance ticket. Two things must
 * hold: GST is added on top of what staff typed, and the invoice lines the
 * rider is billed on sum to the total to the paisa (the tax engine treats each
 * line as GST-inclusive, so lines that drift from the total would mis-state
 * the tax invoice).
 */
describe("computeDamageCharge", () => {
    it("adds GST on top of the entered amounts", () => {
        const c = computeDamageCharge(
            [{ part: "Brake lever", amount: 500 }, { part: "Mirror", amount: 300 }],
            18,
        );
        expect(c.subtotal).toBe(800);
        expect(c.gst_amount).toBe(144);
        expect(c.total).toBe(944);
    });

    it("with no GST the total is the plain sum", () => {
        const c = computeDamageCharge([{ part: "Mirror", amount: 250.5 }], 0);
        expect(c.gst_amount).toBe(0);
        expect(c.total).toBe(250.5);
        expect(c.lines).toEqual([{ description: "Damage: Mirror", amount: 250.5 }]);
    });

    it("invoice lines sum exactly to the total, whatever the rounding", () => {
        const c = computeDamageCharge(
            [
                { part: "Indicator", amount: 33.33 },
                { part: "Footrest", amount: 66.67 },
                { part: "Handle grip", amount: 10.01 },
            ],
            18,
        );
        const sum = Math.round(c.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
        expect(sum).toBe(c.total);
    });

    it("labels each line with the part and the GST it carries", () => {
        const c = computeDamageCharge([{ part: " Tyre ", amount: 1000 }], 18);
        expect(c.lines[0]).toEqual({ description: "Damage: Tyre (incl. 18% GST)", amount: 1180 });
    });

    it("trims notes and turns a blank note into null", () => {
        const c = computeDamageCharge(
            [{ part: "Panel", notes: "  scratched  ", amount: 100 }, { part: "Seat", notes: "   ", amount: 50 }],
            0,
        );
        expect(c.items[0].notes).toBe("scratched");
        expect(c.items[1].notes).toBeNull();
    });
});
