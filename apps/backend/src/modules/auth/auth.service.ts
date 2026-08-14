import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { businessRule } from "../../common/AppError";
import { AccountStatus, AuthContext, STAFF_ROLES, StaffCapability } from "../../types";
import { getUserById } from "../users/users.service";
import { getModulePermissions, ModulePermission } from "../users/staff-permissions.service";
import type { UserDetail } from "../users/users.types";
import { generateNumericOtp, sendOtpSms, toMsg91Mobile } from "./msg91";

export interface SessionContext extends UserDetail {
    /** Rider may unlock a scooter: KYC verified AND account active. */
    can_rent: boolean;
    /** Convenience flag mirrored from roles for the client. */
    is_admin: boolean;
    /** Whether first-time profile creation is still needed. */
    needs_profile: boolean;
    /**
     * WHICH SECTIONS the caller may open, and which actions inside each.
     * null = unrestricted (admin). Array = exact granted module+action
     * pairs (staff). Empty for rider.
     */
    permissions: ModulePermission[] | null;
    /**
     * WHETHER the caller may see raw personal data, independent of which
     * sections they can open. The admin console uses these to hide controls
     * the caller cannot use — the server enforces them regardless, so this is
     * UX rather than a control. See the two-layer note in types/index.ts.
     */
    capabilities: StaffCapability[];
}

/**
 * Pure derivation of the client-facing session flags. Split out so it can be
 * unit-tested without a database.
 */
export function deriveSessionFlags(
    detail: Pick<UserDetail, "full_name" | "kyc_status" | "account_status">,
    roles: AuthContext["roles"],
): { can_rent: boolean; is_admin: boolean; needs_profile: boolean } {
    return {
        is_admin: roles.includes("admin"),
        can_rent:
            detail.kyc_status === "verified" &&
            (detail.account_status as AccountStatus) === "active",
        needs_profile: !detail.full_name || detail.full_name.trim().length === 0,
    };
}

/**
 * The "who am I" payload the mobile splash and profile screens read after a
 * token is verified. Roles/flags always come from the DB record, never from
 * anything the client sent.
 */
export async function getSessionContext(actor: AuthContext): Promise<SessionContext> {
    const detail = await getUserById(actor.id, actor);
    const permissions = await resolveSessionPermissions(actor);
    touchLastLogin(actor.id);
    return {
        ...detail,
        ...deriveSessionFlags(detail, actor.roles),
        permissions,
        // Already resolved by requireAuth, so no extra round trip here.
        capabilities: actor.capabilities,
    };
}

/**
 * Kept separate from deriveSessionFlags (not folded in) so that function can
 * stay pure/DB-free for its own unit tests — this one necessarily hits the
 * database for staff accounts.
 */
async function resolveSessionPermissions(actor: AuthContext): Promise<ModulePermission[] | null> {
    if (actor.roles.includes("admin")) return null;
    if (!actor.roles.some((r) => STAFF_ROLES.includes(r))) return [];
    return getModulePermissions(actor.id);
}

/**
 * Best-effort, fire-and-forget: getSessionContext() is the one choke point
 * both an explicit login and every page-boot "who am I" call (GET
 * /auth/session) run through, so this is the cheapest place to keep
 * users.last_login_at honest for the Staff Access screen — not a hot path
 * (fires once per login/refresh, not polled). Never blocks or throws into
 * the caller; a missed timestamp write must not fail a login.
 */
function touchLastLogin(userId: string): void {
    void supabaseAdmin
        .from("users")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", userId)
        .then(({ error }) => {
            if (error) console.error("[auth] failed to record last_login_at", { userId, error: error.message });
        });
}

/**
 * Global sign-out: revokes every refresh token for the user server-side, so a
 * stolen refresh token can't be used to mint new access tokens after logout.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.signOut(userId, "global");
    // A user with no active sessions is not an error worth surfacing.
    if (error && !/session/i.test(error.message)) throw error;
}

export interface TestSendResult {
    sent: boolean;
    provider_message: string | null;
    /** Only the last two digits are echoed back, never the full number. */
    phone_suffix: string;
}

/**
 * Admin-only diagnostic: sends a throwaway OTP-style SMS through MSG91 so ops
 * can confirm credentials, DLT template and delivery in any environment
 * WITHOUT going through the Supabase hook. The code is random and not stored;
 * it verifies nothing — it only proves the provider path works.
 */
export async function sendTestOtp(phone: string, req?: Request): Promise<TestSendResult> {
    if (!env.msg91AuthKey || !env.msg91OtpTemplateId) {
        throw businessRule("MSG91 is not configured on this environment.");
    }

    const otp = generateNumericOtp(6);
    const result = await sendOtpSms(
        {
            authKey: env.msg91AuthKey,
            templateId: env.msg91OtpTemplateId,
            senderId: env.msg91SenderId || undefined,
            otpVar: env.msg91OtpVar,
            baseUrl: env.msg91BaseUrl,
        },
        { phone, otp },
    );

    // Best-effort record for the audit/rate-limit table.
    void supabaseAdmin
        .from("auth_otp_attempts")
        .insert({
            phone: toMsg91Mobile(phone),
            purpose: "admin_test",
            succeeded: result.ok,
            ip: req?.ip ?? null,
        })
        .then(({ error }) => {
            if (error) console.error("[auth] failed to log otp attempt", error.message);
        });

    if (!result.ok) {
        throw businessRule(
            `MSG91 rejected the request${result.providerMessage ? `: ${result.providerMessage}` : "."}`,
        );
    }

    const digits = toMsg91Mobile(phone);
    return {
        sent: true,
        provider_message: result.providerMessage,
        phone_suffix: digits.slice(-2),
    };
}
