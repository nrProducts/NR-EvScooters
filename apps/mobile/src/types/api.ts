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
    /** Does this rider have a live rental right now? Drives the return flow on
     *  Home and the rental branch of /my-scooter. */
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

export interface ApiNotificationPayload {
    title: string;
    body: string;
    screen?: string;
}

export interface ApiNotification {
    id: string;
    template: string;
    payload: ApiNotificationPayload | null;
    status: 'sent' | 'failed' | 'pending';
    read_at: string | null;
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
    /** Public URL of the model's catalog artwork. */
    image_url: string | null;
    starting_price: number | null;
}

export interface ApiAvailability {
    available_count: number;
    status: 'available' | 'unavailable';
}

export interface ApiVehicleModelDetail extends ApiVehicleModel {
    description: string | null;
    motor_power_watts: number | null;
    battery_capacity: string | null;
    features: string[];
    safety_features: string[];
    /** Only plans still on sale — the backend filters out inactive ones. */
    plans: ApiPlan[];
    /** Fleet-wide for this model. Station-scoped counts come from
     *  vehicleCatalogRepository.availability(id, stationId). */
    availability: ApiAvailability;
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

export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'expired' | 'fulfilled';
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

export type VehicleStatus = 'available' | 'booked' | 'assigned' | 'maintenance' | 'scrap';

/**
 * No payment is captured in this phase, so a refund is a recorded request for
 * the future checkout phase rather than a reversal. 'not_required' covers a
 * cancellation whose refund works out to zero.
 */
export type BookingRefundStatus = 'pending' | 'processed' | 'not_required';

export interface ApiBooking {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_model: { id: string; name: string } | null;
    station: { id: string; name: string; code: string; lat: number; lng: number } | null;
    plan: { id: string; name: string; billing_cycle: BillingCycle; price: number } | null;
    /**
     * The specific physical unit reserved for this booking, if any —
     * populated by the backend's allocate_vehicle_for_booking() once a
     * matching available vehicle exists. Null until one frees up.
     */
    vehicle: {
        id: string; name: string; registration_number: string; battery_percentage: number;
        status: VehicleStatus;
    } | null;
    referral_discount_amount: number | null;

    // --- pre-pickup cancellation (all null unless the rider cancelled) ------
    // Also null for bookings closed by the staff reject flow, which predates
    // this feature and records nothing beyond status='cancelled'.
    cancelled_at: string | null;
    cancellation_reason: string | null;
    /** Net amount owed (plan price minus referral discount), frozen at cancel time. */
    plan_price_at_cancellation: number | null;
    cancellation_penalty_amount: number | null;
    refund_amount: number | null;
    refund_status: BookingRefundStatus | null;
}

export interface ApiReferralReward {
    id: string;
    amount: number;
    reason: string;
    created_at: string;
}

export interface ApiReferralSummary {
    referral_code: string | null;
    referred_count: number;
    qualified_count: number;
    offer_amount: number;
    rewards: ApiReferralReward[];
}

export interface ApiPickupBooking extends ApiBooking {
    rider: { id: string; full_name: string; phone: string | null };
}

export interface ApiAvailableVehicle {
    id: string;
    name: string;
    registration_number: string;
    battery_percentage: number;
}

export type RentalStatus = 'active' | 'completed' | 'force_ended' | 'cancelled';

export interface ApiRental {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: BillingCycle; price: number } | null;

    // --- post-pickup return request (null until the rider asks to return) ---
    // The rental stays 'active' while a return is pending; only staff
    // confirming the physical handover ends it and settles the fee below.
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    days_late: number | null;
    late_penalty_amount: number | null;
    late_fee_per_day: number | null;
}

export interface ReturnRequestPayload {
    reason: string;
    feedback?: string;
    rating: number;
}

export type MaintenanceStatus = 'reported' | 'in_progress' | 'resolved' | 'cancelled';

export interface ApiMaintenanceRecord {
    id: string;
    status: MaintenanceStatus;
    description: string;
    resolved_at: string | null;
    created_at: string;
    vehicle: { id: string; name: string; registration_number: string } | null;
}

/** What Home renders for a rider currently displaced by their own vehicle's maintenance. */
export type MaintenanceNoticeStage = 'pending_triage' | 'quick_fix' | 'temp_vehicle';

export interface ApiMaintenanceNotice {
    ticket_id: string;
    stage: MaintenanceNoticeStage;
    expected_ready_at: string | null;
    temp_vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
}

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateSupportRequestPayload {
    subject: string;
    description: string;
}

export interface ApiSupportRequest {
    id: string;
    subject: string;
    description: string;
    status: SupportStatus;
    priority: SupportPriority;
    resolved_at: string | null;
    created_at: string;
}

export interface ApiSupportQueueItem extends ApiSupportRequest {
    assigned_to: string | null;
    /** Auto-attached at creation from the rider's active rental, if any. */
    rental_id: string | null;
    vehicle_id: string | null;
    rider: { id: string; full_name: string; phone: string | null };
}

export interface UpdateSupportRequestPayload {
    status?: SupportStatus;
    priority?: SupportPriority;
    assigned_to?: string;
}
