import { AccountStatus, KycStatus, RoleName } from "../../types";

export interface UserProfile {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    account_status: AccountStatus;
    kyc_status: KycStatus;
    profile_photo_url: string | null;
    /** Has the rider completed the initial onboarding profile form (spec Step 1)? */
    profile_completed: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface UserListItem extends UserProfile {
    roles: RoleName[];
    assigned_vehicle: { id: string; vin: string; model: string } | null;
    current_plan: { id: string; name: string; status: string } | null;
}

export interface UserDetail extends UserListItem {
    kyc_completion_percent: number;
    documents: Array<{
        id: string;
        doc_type: string;
        doc_number_masked: string | null;
        verification_status: string;
        rejection_reason: string | null;
        expiry_date: string | null;
        submitted_at: string | null;
        verified_at: string | null;
    }>;
}

export interface ListUsersFilters {
    page: number;
    pageSize: number;
    search?: string;
    accountStatus?: AccountStatus;
    kycStatus?: KycStatus;
    role?: RoleName;
    sortBy: "full_name" | "created_at" | "kyc_status";
    sortDir: "asc" | "desc";
    includeDeleted: boolean;
}
