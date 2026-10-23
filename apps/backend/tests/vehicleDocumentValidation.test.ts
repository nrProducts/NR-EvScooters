import { describe, expect, it } from "vitest";
import { createVehicleDocumentBody, updateVehicleDocumentBody } from "../src/modules/vehicles/vehicles.validation";

describe("updateVehicleDocumentBody (admin edit, multipart)", () => {
    it("accepts a full edit from the admin form", () => {
        const r = updateVehicleDocumentBody.safeParse({
            doc_number: " INS-2027-001 ", issued_on: "2026-10-18", expires_on: "2027-10-17",
        });
        expect(r.success).toBe(true);
        expect(r.success && r.data.doc_number).toBe("INS-2027-001");
    });

    it("reads an empty issue date as clearing it (multipart cannot send null)", () => {
        const r = updateVehicleDocumentBody.safeParse({ doc_number: "X1", issued_on: "", expires_on: "2027-01-01" });
        expect(r.success).toBe(true);
        expect(r.success && r.data.issued_on).toBeNull();
    });

    it("allows an empty body — a replacement file alone is a valid edit (the service checks something changed)", () => {
        expect(updateVehicleDocumentBody.safeParse({}).success).toBe(true);
    });

    it("rejects a malformed date, a blank number, and the type (which cannot be changed)", () => {
        expect(updateVehicleDocumentBody.safeParse({ expires_on: "17-10-2027" }).success).toBe(false);
        expect(updateVehicleDocumentBody.safeParse({ doc_number: "   " }).success).toBe(false);
        expect(updateVehicleDocumentBody.safeParse({ doc_type: "insurance" }).success).toBe(false);
    });
});

describe("createVehicleDocumentBody (admin add, multipart)", () => {
    it("parses to the keys CreateVehicleDocumentInput / the service read — doc_type, not document_type", () => {
        const r = createVehicleDocumentBody.safeParse({
            doc_type: "registration", doc_number: "TN14AW1375", expires_on: "2041-09-08",
        });
        expect(r.success).toBe(true);
        expect(r.success && r.data).toEqual({ doc_type: "registration", doc_number: "TN14AW1375", expires_on: "2041-09-08" });
    });
});
