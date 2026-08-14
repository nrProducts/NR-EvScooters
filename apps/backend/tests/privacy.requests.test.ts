import { describe, expect, it } from "vitest";
import {
    ERASURE_GRACE_DAYS, EXPORT_RATE_LIMIT_HOURS, SLA_DAYS,
    graceEndsAt, slaDueAt,
} from "../src/modules/privacy/retention.constants";
import {
    createRequestBody, executeErasureBody, rejectRequestBody,
    updateNomineeBody, updateRequestBody,
} from "../src/modules/privacy/privacy.validation";

const DAY_MS = 86_400_000;

describe("SLA clock", () => {
    it("has a published period for every request type", () => {
        for (const type of ["access_export", "correction", "erasure", "grievance", "nominee_update"] as const) {
            expect(SLA_DAYS[type], type).toBeGreaterThan(0);
        }
    });

    it("computes the due date from the request type", () => {
        const from = new Date("2026-08-14T00:00:00.000Z");
        expect(slaDueAt("erasure", from)).toBe("2026-09-13T00:00:00.000Z");
        expect(slaDueAt("nominee_update", from)).toBe("2026-08-21T00:00:00.000Z");
    });

    it("crosses month and year boundaries correctly", () => {
        const from = new Date("2026-12-20T10:30:00.000Z");
        const due = new Date(slaDueAt("grievance", from));
        expect(due.getTime() - from.getTime()).toBe(SLA_DAYS.grievance * DAY_MS);
        expect(due.getUTCFullYear()).toBe(2027);
    });

    it("gives erasure a grace window measured from approval", () => {
        const from = new Date("2026-08-14T00:00:00.000Z");
        const grace = new Date(graceEndsAt(from));
        expect(grace.getTime() - from.getTime()).toBe(ERASURE_GRACE_DAYS * DAY_MS);
    });

    it("keeps the grace window well inside the erasure SLA", () => {
        // Otherwise the cooling-off period would guarantee an SLA breach.
        expect(ERASURE_GRACE_DAYS).toBeLessThan(SLA_DAYS.erasure);
    });
});

describe("createRequestBody", () => {
    it("accepts a bare export or erasure request", () => {
        expect(createRequestBody.safeParse({ type: "access_export" }).success).toBe(true);
        expect(createRequestBody.safeParse({ type: "erasure" }).success).toBe(true);
    });

    // A grievance with no description cannot be actioned, and telling the
    // rider to resubmit later is worse than refusing now.
    it("requires a description on a grievance", () => {
        expect(createRequestBody.safeParse({ type: "grievance" }).success).toBe(false);
        expect(
            createRequestBody.safeParse({ type: "grievance", details: "My data was shown to someone." })
                .success,
        ).toBe(true);
    });

    it("requires at least one change on a correction", () => {
        expect(createRequestBody.safeParse({ type: "correction" }).success).toBe(false);
        expect(
            createRequestBody.safeParse({
                type: "correction",
                requested_changes: [{ field: "full_name", value: "Anitha Raman" }],
            }).success,
        ).toBe(true);
    });

    // Correction exists for what the rider CANNOT self-edit. Offering it for
    // fields they can already change themselves would create a support queue
    // for no reason.
    it("rejects a correction for a self-editable field", () => {
        expect(
            createRequestBody.safeParse({
                type: "correction",
                requested_changes: [{ field: "phone", value: "+919876543210" }],
            }).success,
        ).toBe(false);
    });

    it("rejects unknown keys rather than dropping them", () => {
        expect(
            createRequestBody.safeParse({ type: "erasure", force: true }).success,
        ).toBe(false);
    });
});

describe("updateRequestBody", () => {
    it("requires at least one field", () => {
        expect(updateRequestBody.safeParse({}).success).toBe(false);
    });

    // A status a reviewer can set by hand must never include the terminal
    // states that carry legal meaning — rejected and withdrawn have their own
    // endpoints, with a reason and an actor.
    it("does not let a reviewer set rejected or withdrawn directly", () => {
        expect(updateRequestBody.safeParse({ status: "rejected" }).success).toBe(false);
        expect(updateRequestBody.safeParse({ status: "withdrawn" }).success).toBe(false);
        expect(updateRequestBody.safeParse({ status: "completed" }).success).toBe(true);
    });

    it("allows unassigning", () => {
        expect(updateRequestBody.safeParse({ assigned_to: null }).success).toBe(true);
    });
});

describe("rejectRequestBody", () => {
    // The reason goes to the rider verbatim. "No" is not a reason.
    it("demands a substantive reason", () => {
        expect(rejectRequestBody.safeParse({ reason: "no" }).success).toBe(false);
        expect(
            rejectRequestBody.safeParse({
                reason: "We could not verify that you are the account holder.",
            }).success,
        ).toBe(true);
    });
});

describe("executeErasureBody", () => {
    it("defaults to not forcing", () => {
        expect(executeErasureBody.parse({}).force).toBe(false);
    });

    // Skipping the cooling-off window is the one irreversible shortcut in the
    // whole flow. It must be justified, and the justification is audited.
    it("requires a reason when forcing", () => {
        expect(executeErasureBody.safeParse({ force: true }).success).toBe(false);
        expect(executeErasureBody.safeParse({ force: true, reason: "short" }).success).toBe(false);
        expect(
            executeErasureBody.safeParse({
                force: true,
                reason: "Court order requires immediate deletion.",
            }).success,
        ).toBe(true);
    });
});

describe("updateNomineeBody", () => {
    it("accepts a name plus one contact channel", () => {
        expect(
            updateNomineeBody.safeParse({
                full_name: "R Raman", relationship: "Father", phone: "+919876543210",
            }).success,
        ).toBe(true);
        expect(
            updateNomineeBody.safeParse({
                full_name: "R Raman", relationship: "Father", email: "r@example.com",
            }).success,
        ).toBe(true);
    });

    it("refuses a nominee with no way to reach them", () => {
        expect(
            updateNomineeBody.safeParse({ full_name: "R Raman", relationship: "Father" }).success,
        ).toBe(false);
    });

    // The nominee never consented to being in our database. Collect the
    // minimum that makes the nomination usable and nothing more.
    it("refuses extra fields such as an address or date of birth", () => {
        expect(
            updateNomineeBody.safeParse({
                full_name: "R Raman",
                relationship: "Father",
                phone: "+919876543210",
                address_line_1: "12 Velachery Main Rd",
            }).success,
        ).toBe(false);
        expect(
            updateNomineeBody.safeParse({
                full_name: "R Raman",
                relationship: "Father",
                phone: "+919876543210",
                date_of_birth: "1960-01-01",
            }).success,
        ).toBe(false);
    });
});

describe("export rate limit", () => {
    it("is at least a day, because each bundle is a full copy of the record", () => {
        expect(EXPORT_RATE_LIMIT_HOURS).toBeGreaterThanOrEqual(24);
    });
});
