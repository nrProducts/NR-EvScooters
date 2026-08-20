import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const insert = vi.fn();
vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: { from: () => ({ insert }) },
}));

const { logPiiAccess, parseReason, PII_ACCESS_REASONS } = await import("../src/common/piiAccess");
import type { AuthContext } from "../src/types";

const staff: AuthContext = {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    role: "staff",
    // `kyc_reviewer` was a capability; it is the `kyc.reveal_number`
    // permission now, granted from the same matrix as everything else.
    permissions: new Set(["kyc.view", "kyc.reveal_number"]),
    status: "active",
    kycStatus: "not_submitted",
    isDeleted: false,
};
const RIDER = "bbbbbbbb-0000-0000-0000-000000000000";

beforeEach(() => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("logPiiAccess", () => {
    it("records the actor, target, resource and fields", async () => {
        await logPiiAccess({
            actor: staff,
            targetUserId: RIDER,
            resource: "kyc_document_image",
            resourceId: "doc-1",
            fields: ["aadhaar_front_image"],
            reason: "kyc_review",
        });

        expect(insert).toHaveBeenCalledOnce();
        expect(insert.mock.calls[0][0]).toMatchObject({
            actor_user_id: staff.id,
            // A SNAPSHOT of the role at access time, singular. The array was
            // the roles the account held; this is what it was when it looked
            // — which is the question an accountability record has to answer
            // years later, after the account has been promoted or revoked.
            actor_role_snapshot: "staff",
            target_user_id: RIDER,
            resource: "kyc_document_image",
            resource_id: "doc-1",
            fields: ["aadhaar_front_image"],
            reason: "kyc_review",
        });
    });

    // Otherwise every rider opening their own KYC screen would fill the table,
    // burying the staff accesses it exists to surface — and the rider-facing
    // "who looked at my data" view would be almost entirely themselves.
    it("skips self-access entirely", async () => {
        await logPiiAccess({
            actor: staff,
            targetUserId: staff.id,
            resource: "user_profile",
        });
        expect(insert).not.toHaveBeenCalled();
    });

    it("defaults an unspecified reason to 'other' rather than null", async () => {
        await logPiiAccess({ actor: staff, targetUserId: RIDER, resource: "user_profile" });
        expect(insert.mock.calls[0][0].reason).toBe("other");
    });

    // Same contract as writeAudit: a failed log must never fail the request a
    // staff member was legitimately making.
    it("never throws when the insert fails", async () => {
        insert.mockResolvedValue({ error: { message: "connection reset" } });
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
            logPiiAccess({ actor: staff, targetUserId: RIDER, resource: "kyc_detail" }),
        ).resolves.toBeUndefined();

        expect(spy).toHaveBeenCalled();
    });

    // A network-level failure REJECTS rather than resolving with { error },
    // so the returned-error check alone is not enough.
    it("never throws when the client itself rejects", async () => {
        insert.mockRejectedValue(new Error("socket hang up"));
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
            logPiiAccess({ actor: staff, targetUserId: RIDER, resource: "kyc_detail" }),
        ).resolves.toBeUndefined();

        expect(spy).toHaveBeenCalled();
    });
});

describe("parseReason", () => {
    it("passes every declared reason through", () => {
        for (const reason of PII_ACCESS_REASONS) {
            expect(parseReason(reason)).toBe(reason);
        }
    });

    it("falls back to 'other' for anything unrecognised", () => {
        expect(parseReason("curiosity")).toBe("other");
        expect(parseReason(undefined)).toBe("other");
        expect(parseReason(42)).toBe("other");
    });
});
