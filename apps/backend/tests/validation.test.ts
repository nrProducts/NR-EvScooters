import { describe, expect, it } from "vitest";
import {
    createUserBody, listUsersQuery, normaliseEmail, normalisePhone,
    selfUpdateUserBody, updatePermissionsBody, updateRolesBody, updateStatusBody, updateUserBody,
} from "../src/modules/users/users.validation";
import { rejectBody, uploadDocumentBody } from "../src/modules/kyc/kyc.validation";

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

describe("personNameSchema (full_name / emergency_contact_name)", () => {
    it("accepts names with apostrophes and hyphens", () => {
        expect(createUserBody.parse({ ...validUser, full_name: "O'Brien" }).full_name).toBe("O'Brien");
        expect(createUserBody.parse({ ...validUser, full_name: "Anne-Marie" }).full_name).toBe("Anne-Marie");
    });

    it("rejects a full_name with digits", () => {
        expect(() => createUserBody.parse({ ...validUser, full_name: "John123" })).toThrow();
    });

    it("rejects a full_name with symbols", () => {
        expect(() => createUserBody.parse({ ...validUser, full_name: "John@Doe" })).toThrow();
    });

    it("rejects an emergency_contact_name with digits on createUserBody", () => {
        expect(() =>
            createUserBody.parse({ ...validUser, emergency_contact_name: "Jane123" }),
        ).toThrow();
    });

    it("accepts a valid emergency_contact_name on updateUserBody", () => {
        expect(updateUserBody.parse({ emergency_contact_name: "Jane Doe" }).emergency_contact_name)
            .toBe("Jane Doe");
    });

    it("rejects an emergency_contact_name with digits on selfUpdateUserBody", () => {
        expect(() =>
            selfUpdateUserBody.parse({ emergency_contact_name: "Jane123" }),
        ).toThrow();
    });

    it("rejects a full_name with digits on updateUserBody", () => {
        expect(() => updateUserBody.parse({ full_name: "John123" })).toThrow();
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

describe("updatePermissionsBody", () => {
    it("accepts an empty module list (revoke everything is valid, unlike roles)", () => {
        expect(updatePermissionsBody.parse({ modules: [] }).modules).toEqual([]);
    });

    it("accepts known module keys", () => {
        expect(updatePermissionsBody.parse({ modules: ["vehicles", "bookings"] }).modules).toEqual([
            "vehicles", "bookings",
        ]);
    });

    it("refuses an unknown module key", () => {
        expect(() => updatePermissionsBody.parse({ modules: ["reconciliation"] })).toThrow();
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

// Shape only. The Aadhaar checksum and the driving-licence format live in
// kyc.docnumber.ts and are covered by kyc.docnumber.test.ts — this schema
// deliberately stays permissive so the error the rider sees comes from the
// domain check, with a message about their card, not from a regex.
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
