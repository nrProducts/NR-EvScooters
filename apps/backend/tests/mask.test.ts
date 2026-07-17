import { describe, expect, it } from "vitest";
import { maskDocumentNumber, safeAuditPayload } from "../src/common/mask";

describe("maskDocumentNumber", () => {
    it("keeps only the last four characters", () => {
        expect(maskDocumentNumber("DL1420110012345")).toBe("***********2345");
    });

    it("masks short numbers entirely", () => {
        expect(maskDocumentNumber("1234")).toBe("****");
    });

    it("passes null through", () => {
        expect(maskDocumentNumber(null)).toBeNull();
    });
});

describe("safeAuditPayload", () => {
    it("drops secrets and storage locations", () => {
        const out = safeAuditPayload({
            email: "a@b.com",
            password: "hunter2",
            access_token: "ey...",
            storage_path: "uid/national_id/front.jpg",
            file_url: "https://x",
        });
        expect(out).toEqual({ email: "a@b.com" });
    });

    it("masks rather than drops document numbers", () => {
        expect(safeAuditPayload({ doc_number: "DL1420110012345" })).toEqual({
            doc_number: "***********2345",
        });
    });

    it("returns null for no payload", () => {
        expect(safeAuditPayload(null)).toBeNull();
    });
});
