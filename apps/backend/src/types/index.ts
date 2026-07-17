export type RoleName = "rider" | "staff" | "technician" | "station_manager" | "admin";
export const ROLE_NAMES: readonly RoleName[] = [
    "rider", "staff", "technician", "station_manager", "admin",
] as const;

export const STAFF_ROLES: readonly RoleName[] = ["staff", "technician", "station_manager", "admin"] as const;

export type AccountStatus = "active" | "inactive" | "suspended";
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ["active", "inactive", "suspended"] as const;

export type KycStatus = "not_submitted" | "pending" | "partially_verified" | "verified" | "rejected";
export const KYC_STATUSES: readonly KycStatus[] = [
    "not_submitted", "pending", "partially_verified", "verified", "rejected",
] as const;

export type KycDocType = "national_id" | "driving_license" | "passport" | "voter_id" | "address_proof";
export const KYC_DOC_TYPES: readonly KycDocType[] = [
    "national_id", "driving_license", "passport", "voter_id", "address_proof",
] as const;

/** Types a rider must have verified before overall KYC can reach 'verified'. */
export const MANDATORY_KYC_DOC_TYPES: readonly KycDocType[] = ["national_id", "driving_license"] as const;

export type VerificationStatus = "pending" | "verified" | "rejected";

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AuthContext {
    id: string;
    email?: string;
    roles: RoleName[];
    accountStatus: AccountStatus;
    kycStatus: KycStatus;
    isDeleted: boolean;
}
