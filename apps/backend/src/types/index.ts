export type RoleName = "rider" | "staff" | "technician" | "station_manager" | "admin";
export const ROLE_NAMES: readonly RoleName[] = [
    "rider", "staff", "technician", "station_manager", "admin",
] as const;

export const STAFF_ROLES: readonly RoleName[] = ["staff", "technician", "station_manager", "admin"] as const;

/**
 * Orthogonal to role. Role says which part of the business someone works in;
 * capability says whether they may see raw personal data. Granted per user in
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
