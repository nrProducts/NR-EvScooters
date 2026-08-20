import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { businessRule } from "../../common/AppError";
import { AuthContext, PermissionKey, UserStatus, isStaffRole } from "../../types";
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
     * The same grants, flattened to `"<module>.<action>"` keys.
     *
     * This field is where the old `capabilities` array went. Seeing a raw
     * Aadhaar number is no longer a separate kind of thing from opening the
     * KYC queue — it is `kyc.reveal_number` sitting next to `kyc.view` — so
     * the console reads one list to decide what to render. The server
     * enforces every one of them regardless; this is UX, not a control.
     */
    permission_keys: PermissionKey[];
}

/**
 * Pure derivation of the client-facing session flags. Split out so it can be
 * unit-tested without a database.
 */
export function deriveSessionFlags(
    detail: Pick<UserDetail, "full_name" | "kyc_status" | "account_status">,
    role: AuthContext["role"],
): { can_rent: boolean; is_admin: boolean; needs_profile: boolean } {
    return {
        is_admin: role === "admin",
        can_rent:
            detail.kyc_status === "verified" &&
            (detail.account_status as UserStatus) === "active",
        needs_profile: !detail.full_name || detail.full_name.trim().length === 0,
    };
}

/**
 * The "who am I" payload the mobile splash and profile screens read after a
 * token is verified. Role and flags always come from the DB record, never
 * from anything the client sent.
 */
export async function getSessionContext(actor: AuthContext): Promise<SessionContext> {
    const detail = await getUserById(actor.id, actor);
    const permissions = await resolveSessionPermissions(actor);
    return {
        ...detail,
        ...deriveSessionFlags(detail, actor.role),
        permissions,
        // Already resolved by requireAuth, so no extra round trip here.
        permission_keys: [...actor.permissions],
    };
}

/**
 * Kept separate from deriveSessionFlags (not folded in) so that function can
 * stay pure/DB-free for its own unit tests — this one necessarily hits the
 * database for staff accounts.
 */
async function resolveSessionPermissions(actor: AuthContext): Promise<ModulePermission[] | null> {
    if (actor.role === "admin") return null;
    if (!isStaffRole(actor.role)) return [];
    return getModulePermissions(actor.id);
}

/*
 * touchLastLogin() lived here.
 *
 * It wrote `users.last_login_at` on every session resolution. The new schema
 * has no such column, and adding one would mean a write on every page boot to
 * shadow `auth.users.last_sign_in_at`, which Supabase already maintains
 * accurately. The Staff Access screen reads it through users.service.ts's
 * lastLoginFor() instead.
 */

/**
 * Whether any live (non-deleted) account holds this email or phone.
 * Public/unauthenticated — used by the web login screen to tell "no account
 * exists yet" apart from "wrong password" without Supabase's
 * signInWithPassword call itself ever revealing that (it deliberately
 * returns the same generic error for both, to prevent enumeration). Login is
 * already staff/admin-only and the public POST /auth/signup endpoint reveals
 * the same "email already registered" fact, so this adds no new exposure.
 */
export async function checkAccountExists(identifier: string): Promise<boolean> {
    const isEmail = identifier.includes("@");
    let q = supabaseAdmin.from("users").select("id").is("deleted_at", null).limit(1);
    q = isEmail ? q.ilike("email", identifier.trim().toLowerCase()) : q.eq("phone", identifier.trim().replace(/[\s()-]/g, ""));
    const { data, error } = await q;
    if (error) throw error;
    return !!data && data.length > 0;
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

/**
 * Clears the temporary-password flag once the caller has set their own
 * password. Called after both the forced first-login change (new staff
 * account) and the self-service forgot-password reset, so it's cleared
 * regardless of which path got them there — a no-op if already false.
 */
export async function completePasswordChange(userId: string): Promise<void> {
    // The flag moved to staff_profiles with the identity split. A rider has no
    // row there and never had the flag, so an update matching nothing is the
    // correct no-op rather than an error.
    const { error } = await supabaseAdmin
        .from("staff_profiles")
        .update({ must_change_password: false })
        .eq("user_id", userId);
    if (error) throw error;
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

    // The `auth_otp_attempts` table this used to log to does not exist in the
    // new schema — it was a rate-limit ledger for an OTP path that Supabase's
    // own hook now owns. This diagnostic sends one SMS on an admin's explicit
    // request, so there is nothing to rate-limit and nothing worth a row.

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
