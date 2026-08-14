export type RoleName = "rider" | "staff" | "technician" | "station_manager" | "admin";
export const ROLE_NAMES: readonly RoleName[] = [
    "rider", "staff", "technician", "station_manager", "admin",
] as const;

export const STAFF_ROLES: readonly RoleName[] = ["staff", "technician", "station_manager", "admin"] as const;

/**
 * ============================================================================
 * TWO LAYERS OF STAFF AUTHORISATION. They are not alternatives.
 * ============================================================================
 *
 * ModuleKey answers "which part of the console may this person OPEN?"
 * StaffCapability answers "may this person see RAW PERSONAL DATA?"
 *
 * They compose, coarse gate then fine gate. Reaching the KYC queue needs the
 * `kyc` module; opening the Aadhaar image inside it additionally needs the
 * `kyc_reviewer` capability. An ops agent can therefore work the queue —
 * chasing riders for missing documents — without ever being able to look at
 * an identity document, which is the whole point of the DPDPA least-privilege
 * work and is not expressible with modules alone.
 *
 * Keep them separate. Folding capabilities into MODULE_KEYS would make
 * "can open the KYC section" and "can view someone's Aadhaar" the same
 * permission, which is the state this replaced.
 */

/**
 * Modules a staff account can be individually granted access to (see
 * public.staff_permissions / requireModule() in authorize.middleware.ts).
 * Admin bypasses this entirely — always unconditional access. Mirrored in
 * apps/web/src/types/index.ts — keep both lists in sync by hand (no shared
 * package exists in this monorepo).
 */
export type ModuleKey =
    | "vehicles" | "users" | "kyc" | "bookings" | "maintenance" | "support"
    | "payments" | "notifications" | "damages" | "refunds"
    // The data-principal rights queue. No migration needed to add a module —
    // staff_permissions.module_key is deliberately free text (see
    // 20260813100100_staff_role_seed_and_permissions_table.sql).
    | "privacy";
export const MODULE_KEYS: readonly ModuleKey[] = [
    "vehicles", "users", "kyc", "bookings", "maintenance", "support",
    "payments", "notifications", "damages", "refunds", "privacy",
] as const;

/**
 * Orthogonal to both role and module. Granted per user in
 * public.user_capabilities, never implied by a role — including admin, which
 * only starts with all three because the migration backfilled existing admins
 * so nobody was locked out on deploy.
 */
export type StaffCapability = "kyc_reviewer" | "rights_officer" | "pii_exporter";
export const STAFF_CAPABILITIES: readonly StaffCapability[] = [
    "kyc_reviewer", "rights_officer", "pii_exporter",
] as const;

export type AccountStatus = "active" | "inactive" | "suspended";
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ["active", "inactive", "suspended"] as const;

export type KycStatus = "not_submitted" | "pending" | "partially_verified" | "verified" | "rejected";
export const KYC_STATUSES: readonly KycStatus[] = [
    "not_submitted", "pending", "partially_verified", "verified", "rejected",
] as const;

export type KycDocType = "aadhaar" | "driving_license" | "passport" | "voter_id" | "address_proof";
export const KYC_DOC_TYPES: readonly KycDocType[] = [
    "aadhaar", "driving_license", "passport", "voter_id", "address_proof",
] as const;

/** Types a rider must have verified before overall KYC can reach 'verified'. */
export const MANDATORY_KYC_DOC_TYPES: readonly KycDocType[] = ["aadhaar", "driving_license"] as const;

export type VerificationStatus = "pending" | "verified" | "rejected";

export type NotificationChannel = "sms" | "push" | "email";
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["sms", "push", "email"] as const;

export type NotificationStatus = "sent" | "failed" | "pending";
export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = ["sent", "failed", "pending"] as const;

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AuthContext {
    id: string;
    email?: string;
    roles: RoleName[];
    capabilities: StaffCapability[];
    accountStatus: AccountStatus;
    kycStatus: KycStatus;
    isDeleted: boolean;
}
