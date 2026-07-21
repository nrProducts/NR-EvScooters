import { describe, expect, it } from "vitest";
import {
    createUserBody, listUsersQuery, normaliseEmail, normalisePhone,
    selfUpdateUserBody, updateRolesBody, updateStatusBody,
} from "../src/modules/users/users.validation";
import { rejectBody, uploadDocumentBody } from "../src/modules/kyc/kyc.validation";
import { assertValidAadhaar } from "../src/modules/kyc/kyc.service";

const validUser = {
    full_name: "Asha Menon",
    email: "  ASHA@Example.COM ",
    phone: "+919876543210",
    date_of_birth: "1995-04-12",
};

describe("createUserBody", () => {
    it("normalises the email and defaults the role to rider", () => {
        const parsed = createUserBody.parse(validUser);
        expect(parsed.email).toBe("asha@example.com");
        expect(parsed.role).toBe("rider");
        expect(parsed.account_status).toBe("active");
    });

    it("rejects a malformed email", () => {
        expect(() => createUserBody.parse({ ...validUser, email: "not-an-email" })).toThrow();
    });

    it("rejects a phone number without international format", () => {
        expect(() => createUserBody.parse({ ...validUser, phone: "98765" })).toThrow();
    });

    it("rejects a rider under 18", () => {
        const dob = new Date();
        dob.setFullYear(dob.getFullYear() - 15);
        expect(() =>
            createUserBody.parse({ ...validUser, date_of_birth: dob.toISOString().slice(0, 10) }),
        ).toThrow(/18/);
    });

    it("rejects a future date of birth", () => {
        expect(() => createUserBody.parse({ ...validUser, date_of_birth: "2099-01-01" })).toThrow();
    });
});

describe("selfUpdateUserBody", () => {
    it("accepts permitted profile fields", () => {
        expect(selfUpdateUserBody.parse({ city: "Kochi" })).toEqual({ city: "Kochi" });
    });

    it("refuses an attempt to set account_status", () => {
        expect(() => selfUpdateUserBody.parse({ account_status: "active" })).toThrow();
    });

    it("refuses an attempt to set kyc_status", () => {
        expect(() => selfUpdateUserBody.parse({ kyc_status: "verified" })).toThrow();
    });

    it("refuses an attempt to clear deleted_at", () => {
        expect(() => selfUpdateUserBody.parse({ deleted_at: null })).toThrow();
    });

    it("refuses an empty patch", () => {
        expect(() => selfUpdateUserBody.parse({})).toThrow();
    });
});

describe("updateStatusBody", () => {
    it("requires a reason when suspending", () => {
        expect(() => updateStatusBody.parse({ action: "suspend" })).toThrow();
    });

    it("accepts a suspension with a reason", () => {
        expect(updateStatusBody.parse({ action: "suspend", reason: "Repeated damage reports" })).toMatchObject({
            action: "suspend",
        });
    });

    it("does not require a reason to activate", () => {
        expect(updateStatusBody.parse({ action: "activate" }).action).toBe("activate");
    });
});

describe("updateRolesBody", () => {
    it("refuses an empty role list", () => {
        expect(() => updateRolesBody.parse({ roles: [] })).toThrow(/at least one role/);
    });

    it("refuses an unknown role", () => {
        expect(() => updateRolesBody.parse({ roles: ["superuser"] })).toThrow();
    });

    it("accepts a known role", () => {
        expect(updateRolesBody.parse({ roles: ["staff"] }).roles).toEqual(["staff"]);
    });
});

describe("listUsersQuery", () => {
    it("applies defaults", () => {
        const q = listUsersQuery.parse({});
        expect(q).toMatchObject({ page: 1, pageSize: 20, sortBy: "created_at", includeDeleted: false });
    });

    it("coerces numeric strings from the query string", () => {
        expect(listUsersQuery.parse({ page: "3", pageSize: "50" })).toMatchObject({ page: 3, pageSize: 50 });
    });

    it("caps pageSize", () => {
        expect(() => listUsersQuery.parse({ pageSize: "5000" })).toThrow();
    });

    it("parses includeDeleted as a boolean", () => {
        expect(listUsersQuery.parse({ includeDeleted: "true" }).includeDeleted).toBe(true);
    });
});

describe("uploadDocumentBody", () => {
    it("accepts an aadhaar document", () => {
        expect(uploadDocumentBody.parse({ doc_type: "aadhaar", doc_number: "ABCD1234" }).doc_type)
            .toBe("aadhaar");
    });

    it("rejects a too-short document number", () => {
        expect(() => uploadDocumentBody.parse({ doc_type: "aadhaar", doc_number: "AB" })).toThrow();
    });

    it("rejects a document number with punctuation", () => {
        expect(() => uploadDocumentBody.parse({ doc_type: "aadhaar", doc_number: "AB#$1234" })).toThrow();
    });
});

describe("assertValidAadhaar (via kyc.service.uploadDocument doc_type branch)", () => {
    it("accepts a well-formed 12-digit aadhaar number", () => {
        expect(() => assertValidAadhaar("234567890123")).not.toThrow();
    });

    it("accepts a 12-digit aadhaar number with spaces or hyphens", () => {
        expect(() => assertValidAadhaar("2345 6789 0123")).not.toThrow();
        expect(() => assertValidAadhaar("2345-6789-0123")).not.toThrow();
    });

    it("rejects fewer than 12 digits", () => {
        expect(() => assertValidAadhaar("123456789")).toThrow(/12-digit/);
    });

    it("rejects more than 12 digits", () => {
        expect(() => assertValidAadhaar("1234567890123")).toThrow(/12-digit/);
    });

    it("rejects non-numeric characters", () => {
        expect(() => assertValidAadhaar("2345ABCD0123")).toThrow(/12-digit/);
    });
});

describe("rejectBody", () => {
    it("rejects a missing reason", () => {
        expect(() => rejectBody.parse({})).toThrow();
    });

    it("rejects a token reason", () => {
        expect(() => rejectBody.parse({ reason: "bad" })).toThrow();
    });

    it("accepts a substantive reason", () => {
        expect(rejectBody.parse({ reason: "The licence photo is too blurred to read." }).reason)
            .toMatch(/blurred/);
    });
});

describe("normalisers", () => {
    it("lowercases and trims emails", () => {
        expect(normaliseEmail("  Foo@BAR.com ")).toBe("foo@bar.com");
    });

    it("strips separators from phone numbers so variants collide", () => {
        expect(normalisePhone("+91 98765-43210")).toBe("+919876543210");
        expect(normalisePhone("(+91) 9876543210")).toBe("+919876543210");
    });
});
