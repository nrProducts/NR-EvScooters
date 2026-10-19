import { describe, expect, it } from "vitest";
import { updateVehicleBody } from "../src/modules/vehicles/vehicles.validation";

// The exact body the admin "Edit vehicle" form sent before the fix (Scoot 15).
const sentBeforeFix = {
    name: "Scoot 15",
    registration_number: "TN22AB0015",
    vin: "VINMOCK00000000015",
    vehicle_model_id: "ac357f08-0d26-44b4-ac49-5a2cd0df85f0",
    color: "Blue",
    qr_code: "QR-MOCK-0015",
    imei: "IMEIMOCK0000000015",
    purchase_date: "2026-10-15",
    batch_number: "1",
};

describe("updateVehicleBody (admin Edit vehicle)", () => {
    it("rejects vehicle_model_id — the model is fixed at creation", () => {
        const r = updateVehicleBody.safeParse(sentBeforeFix);
        expect(r.success).toBe(false);
        expect(JSON.stringify(r.error?.issues)).toContain("vehicle_model_id");
    });

    it("accepts the same edit without the model (what toVehicleUpdate sends)", () => {
        const { vehicle_model_id: _model, ...withoutModel } = sentBeforeFix;
        expect(updateVehicleBody.safeParse(withoutModel).success).toBe(true);
    });

    it("accepts null to clear optional fields", () => {
        const r = updateVehicleBody.safeParse({
            registration_number: "TN22AB0015", vin: "VINMOCK00000000015",
            name: null, color: null, qr_code: null, imei: null, purchase_date: null, batch_number: null,
        });
        expect(r.success).toBe(true);
    });
});
