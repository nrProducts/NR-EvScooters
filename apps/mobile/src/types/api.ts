/**
 * Mirrors apps/backend/src/types/index.ts and the module response shapes.
 * Kept hand-written rather than generated so the mobile app depends on the
 * API contract, not on the backend's internal row types.
 */

export type RoleName = 'rider' | 'staff' | 'technician' | 'station_manager' | 'admin';
export const ROLE_NAMES: RoleName[] = ['rider', 'staff', 'technician', 'station_manager', 'admin'];

export type AccountStatus = 'active' | 'inactive' | 'suspended';
export const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'inactive', 'suspended'];

export type KycStatus = 'not_submitted' | 'pending' | 'partially_verified' | 'verified' | 'rejected';
export const KYC_STATUSES: KycStatus[] = [
    'not_submitted', 'pending', 'partially_verified', 'verified', 'rejected',
];

export type KycDocType = 'aadhaar' | 'driving_license' | 'passport' | 'voter_id' | 'address_proof';
export const MANDATORY_KYC_DOC_TYPES: KycDocType[] = ['aadhaar', 'driving_license'];

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export const GENDERS: Gender[] = ['male', 'female', 'other', 'prefer_not_to_say'];

export interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}

export interface Paginated<T> {
    data: T[];
    pagination: Pagination;
}

export interface ApiUser {
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
    roles: RoleName[];
    assigned_vehicle: { id: string; vin: string; model: string } | null;
    current_plan: { id: string; name: string; status: string } | null;
}

export interface ApiUserDetail extends ApiUser {
    kyc_completion_percent: number;
    documents: Array<{
        id: string;
        doc_type: KycDocType;
        doc_number_masked: string | null;
        verification_status: VerificationStatus;
        rejection_reason: string | null;
        expiry_date: string | null;
        submitted_at: string | null;
        verified_at: string | null;
    }>;
}

/** GET /users/me adds the flags the UI gates on. */
export interface ApiMe extends ApiUserDetail {
    can_rent: boolean;
    is_admin: boolean;
    /** Does this rider have a live rental right now? Always false until the
     *  booking flow ships — see post-booking-dashboard.tsx gating in _layout.tsx. */
    has_active_rental: boolean;
    /** Does this rider have a booking in progress? pending_payment counts
     *  as active, same as confirmed — see useHasActiveBooking. */
    has_active_booking: boolean;
}

export interface ListUsersParams {
    page?: number;
    pageSize?: number;
    search?: string;
    accountStatus?: AccountStatus;
    kycStatus?: KycStatus;
    role?: RoleName;
    sortBy?: 'full_name' | 'created_at' | 'kyc_status';
    sortDir?: 'asc' | 'desc';
    includeDeleted?: boolean;
}

export interface CreateUserPayload {
    full_name: string;
    email: string;
    phone: string;
    date_of_birth?: string;
    gender?: Gender;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    role?: RoleName;
    account_status?: AccountStatus;
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'role' | 'account_status'>>;

export type StatusAction = 'activate' | 'deactivate' | 'suspend';

export interface ApiDocument {
    id: string;
    doc_type: KycDocType;
    doc_number: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    expiry_date: string | null;
    is_expired: boolean;
    submitted_at: string | null;
    verified_at: string | null;
    has_back_side: boolean;
    created_at: string;
}

export interface ApiKycSummary {
    user_id: string;
    kyc_status: KycStatus;
    completion_percent: number;
    missing_document_types: KycDocType[];
    can_submit: boolean;
    documents: ApiDocument[];
}

export interface ApiKycQueueItem {
    user_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    kyc_status: KycStatus;
    completion_percent: number;
    document_count: number;
    earliest_submitted_at: string | null;
    has_expired_document: boolean;
}

export interface ApiKycDetail {
    rider: {
        id: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        date_of_birth: string | null;
        address_line_1: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        country: string | null;
        kyc_status: KycStatus;
        account_status: AccountStatus;
    };
    kyc_status: KycStatus;
    completion_percent: number;
    documents: ApiDocument[];
    history: Array<{
        id: string;
        action: string;
        actor_id: string | null;
        created_at: string;
        after_data: Record<string, unknown> | null;
    }>;
}

export interface ApiSignedUrl {
    url: string;
    expires_in: number;
}

/** The backend's one and only error envelope (§16). */
export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        fields?: Record<string, string>;
    };
}

export interface LocalFile {
    uri: string;
    name: string;
    mimeType: string;
}

// ---------------------------------------------------------------------------
// Vehicle catalog (rider-facing browse/detail — distinct from fleet
// inventory). Mirrors apps/backend/src/modules/vehicle-catalog/vehicle-catalog.types.ts
// ---------------------------------------------------------------------------

export type VehicleCategory = 'scooter' | 'bike' | 'moped';
export const VEHICLE_CATEGORIES: VehicleCategory[] = ['scooter', 'bike', 'moped'];

export interface ApiVendor {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
}

export interface ApiVehicleImage {
    id: string;
    url: string;
    alt_text: string | null;
    is_hero: boolean;
    sort_order: number;
}

export type BillingCycle = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface ApiPlan {
    id: string;
    name: string;
    billing_cycle: BillingCycle;
    price: number;
    included_minutes: number | null;
}

export interface ApiVehicleModel {
    id: string;
    name: string;
    category: VehicleCategory;
    tagline: string | null;
    battery_range_km: number | null;
    top_speed_kmph: number | null;
    charging_time_hours: number | null;
    is_featured: boolean;
    vendor: ApiVendor | null;
    hero_image_url: string | null;
    starting_price: number | null;
}

export interface ApiVehicleModelDetail extends ApiVehicleModel {
    description: string | null;
    motor_power_watts: number | null;
    battery_capacity: string | null;
    features: string[];
    safety_features: string[];
    images: ApiVehicleImage[];
    plans: ApiPlan[];
    availability: {
        available_count: number;
        status: 'available' | 'unavailable';
    };
}

export interface ListVehicleModelsParams {
    page?: number;
    pageSize?: number;
    category?: VehicleCategory;
    vendorId?: string;
    search?: string;
    sortBy?: 'name' | 'created_at' | 'battery_range_km' | 'sort_order';
    sortDir?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Booking (Phase 1 — no live payment). Mirrors
// apps/backend/src/modules/bookings/bookings.types.ts.
// ---------------------------------------------------------------------------

export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'expired';
export const BOOKING_STATUSES: BookingStatus[] = ['pending_payment', 'confirmed', 'cancelled', 'expired'];

export interface ApiStation {
    id: string;
    name: string;
    code: string;
    lat: number;
    lng: number;
    distance_km?: number;
}

export interface CreateBookingPayload {
    vehicle_model_id: string;
    station_id: string;
    plan_id: string;
    start_day: string; // YYYY-MM-DD
}

export interface ApiBooking {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_model: { id: string; name: string } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: BillingCycle; price: number } | null;
}
