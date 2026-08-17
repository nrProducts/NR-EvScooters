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
    /**
     * False when any required consent is missing OR was given against an
     * older privacy notice. Folded in here so the routing gate in _layout.tsx
     * can send the rider to /consent without a second request, and so
     * publishing a notice revision re-prompts everyone automatically.
     */
    consent_up_to_date: boolean;
    consent_notice_version: string;
}

/**
 * PATCH /users/me. Mirrors selfUpdateUserBody in the backend's
 * users.validation.ts — `role` and `account_status` are deliberately absent:
 * the API rejects them with a 400 rather than silently dropping them.
 */
export interface UpdateUserPayload {
    full_name?: string;
    email?: string;
    phone?: string;
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
}

export interface ApiDocument {
    id: string;
    doc_type: KycDocType;
    /**
     * Display-only tail, e.g. "•••• 0124". The full Aadhaar/DL number is
     * validated at upload and deliberately never stored, so there is no
     * unmasked form of this field anywhere in the system.
     */
    doc_number_masked: string | null;
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
    /** Source of truth for the recurring-billing cadence — billing_cycle is display-only. */
    duration_days: number;
    deposit_amount: number;
}

export interface ApiAvailability {
    available_count: number;
    status: 'available' | 'unavailable';
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
    /** Fleet-wide for this model. Station-scoped counts come from
     *  vehicleCatalogRepository.availability(id, stationId). */
    availability: ApiAvailability;
}

export interface ApiVehicleModelDetail extends ApiVehicleModel {
    description: string | null;
    motor_power_watts: number | null;
    battery_capacity: string | null;
    features: string[];
    safety_features: string[];
    /** Only plans still on sale — the backend filters out inactive ones. */
    plans: ApiPlan[];
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

/**
 * 'completed': the rider returned the scooter for good. Distinct from
 * 'fulfilled', which now means "picked up and still riding" — before this,
 * a fulfilled booking never had a terminal state at all.
 */
export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'expired' | 'fulfilled' | 'completed';
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
export type BookingRefundStatus = 'pending' | 'processing' | 'processed' | 'not_required' | 'failed';

export interface ApiBooking {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_model: { id: string; name: string } | null;
    station: { id: string; name: string; code: string; lat: number; lng: number } | null;
    plan: {
        id: string; name: string; billing_cycle: BillingCycle; price: number;
        duration_days: number; deposit_amount: number;
    } | null;
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
    refund_initiated_at: string | null;
    refund_completed_at: string | null;
    refund_transaction_id: string | null;
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

// ---------------------------------------------------------------------------
// Payments — mirrors apps/backend/src/modules/payments/payments.types.ts.
// Amounts are always computed server-side; the app never sends one.
// ---------------------------------------------------------------------------

export interface ApiPaymentOrder {
    /** Our internal payment_orders.id, not the gateway's. */
    orderId: string;
    gatewayOrderId: string;
    /** Rupees. */
    amount: number;
    currency: string;
    /** Razorpay's PUBLIC key id — safe on-device, never the secret. */
    keyId: string;
    /**
     * True when the backend has no Razorpay keys configured yet — the order
     * is already settled server-side with temp data. Skip Checkout and
     * /payments/verify entirely and treat this as paid immediately.
     */
    mock: boolean;
}

export interface VerifyPaymentPayload {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

// ---------------------------------------------------------------------------
// Rider billing — mirrors the plan/deposit/damage/refund fields
// bookings.types.ts adds on top of ApiBooking, plus the invoices/deposit
// views the rider payment screen reads.
// ---------------------------------------------------------------------------

export type PlanStatus = 'active' | 'due' | 'paused';

export interface ApiBookingWithPlan extends ApiBooking {
    plan_status: PlanStatus | null;
    plan_activated_at: string | null;
    plan_duration_days: number | null;
    deposit_amount_at_booking: number | null;
    current_period_start: string | null;
    next_due_at: string | null;
    plan_paused_at: string | null;
    plan_paused_days_total: number;
}

export type InvoicePaymentType = 'rental' | 'deposit' | 'damage' | 'penalty' | 'refund' | 'other';
export type InvoicePaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';

/** A single invoice line — see 20260817100000_billing_charge_engine.sql. Empty on every invoice minted before that migration. */
export interface ApiInvoiceItem {
    id: string;
    item_type: 'base_rental' | 'charge' | 'discount';
    rider_charge_id: string | null;
    label: string;
    amount: number;
    created_at: string;
}

export interface ApiInvoice {
    id: string;
    payment_type: InvoicePaymentType | null;
    amount_due: number;
    due_date: string;
    payment_status: InvoicePaymentStatus;
    paid_at: string | null;
    created_at: string;
    items: ApiInvoiceItem[];
}

export interface ApiEarlyRechargeLineItem {
    itemType: 'base_rental' | 'charge' | 'discount';
    label: string;
    amount: number;
}

/** POST /bookings/me/:id/recharge — the just-generated (or already-pending) upcoming-period invoice, ready to review then pay. Generating it never charges anything by itself. */
export interface ApiEarlyRecharge {
    invoiceId: string;
    amountDue: number;
    dueDate: string;
    items: ApiEarlyRechargeLineItem[];
}

export type DepositStatus = 'pending' | 'held' | 'partially_refunded' | 'refunded' | 'forfeited';

export interface ApiDeposit {
    id: string;
    booking_id: string;
    amount: number;
    status: DepositStatus;
    held_at: string | null;
    refund_eligible_at: string | null;
    refunded_at: string | null;
    forfeited_at: string | null;
    refund_id: string | null;
    /** Deposit minus non-disputed damage deductions — the deposit's own amount when not yet `held`. */
    refundable_amount: number;
}

export type DamageStatus = 'recorded' | 'disputed' | 'resolved';

export interface ApiDamage {
    id: string;
    booking_id: string;
    amount: number;
    description: string;
    deposit_deduction: number;
    outstanding_amount: number;
    status: DamageStatus;
    created_at: string;
    disputed_at: string | null;
    dispute_reason: string | null;
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
    /** Resolves which booking's plan/deposit/damage/payment history this rental belongs to. */
    booking_id: string | null;
    vehicle: {
        id: string;
        name: string;
        registration_number: string;
        battery_percentage: number;
        /** Scheduled service date. Null until fleet ops set one, so the UI must hide the row. */
        next_service_due_date: string | null;
    } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: BillingCycle; price: number } | null;

    // --- the rider's plan, frozen at pickup (20260804100000) ---------------
    // expires_at is the DEFAULT return deadline, so the effective deadline is
    // `return_due_at ?? expires_at` — see effectiveDueAt in lib/returnPolicy.
    // All null on a rental with no booking to inherit a plan from; those
    // never expire.
    plan_id: string | null;
    plan_duration_days: number | null;
    plan_price_at_pickup: number | null;
    expires_at: string | null;

    // --- recurring-billing state (bookings.plan_status/next_due_at) --------
    // Unlike expires_at above (frozen at pickup as the FIRST period's end),
    // next_due_at rolls forward every renewal — it's what actually reflects
    // whether the rider's current committed week is over yet. Both null on a
    // rental with no plan.
    plan_status: PlanStatus | null;
    next_due_at: string | null;

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
    /** Staff's ETA, set at triage. Null until then, and meaningless once resolved. */
    expected_ready_at: string | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
}

/**
 * Filters for GET /maintenance/me/history. The server additionally scopes
 * results to vehicles this rider rented, from their pickup onward — these
 * narrow that set, they don't widen it.
 */
export interface MaintenanceHistoryParams {
    page?: number;
    pageSize?: number;
    status?: MaintenanceStatus;
    vehicleId?: string;
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

// ---------------------------------------------------------------------------
// DPDPA — consent (mirrors apps/backend/src/modules/consent/consent.types.ts)
// ---------------------------------------------------------------------------

export type ConsentPurpose =
    | 'kyc_identity_verification'
    | 'service_delivery'
    | 'payments_and_billing'
    | 'safety_and_incident'
    | 'service_communications'
    | 'marketing_communications'
    | 'referral_program'
    | 'location_services';

export type ConsentAction = 'granted' | 'withdrawn';

export interface ApiConsentNotice {
    id: string;
    version: string;
    effective_from: string;
    language: 'en' | 'ta';
    /** Markdown, authored per language and served from the database. */
    body: string;
    body_sha256: string;
    purposes: ConsentPurpose[];
    required_purposes: ConsentPurpose[];
    optional_purposes: ConsentPurpose[];
}

export interface ApiConsentItem {
    purpose: ConsentPurpose;
    required: boolean;
    granted: boolean;
    decided_at: string | null;
    notice_version: string | null;
}

export interface ApiConsentState {
    current_notice_version: string;
    /**
     * Every required purpose granted against the CURRENT notice version. The
     * consent screen shows itself whenever this is false, which is what makes
     * re-consent on a new notice automatic.
     */
    up_to_date: boolean;
    items: ApiConsentItem[];
}

export interface ApiConsentHistoryItem {
    id: string;
    purpose: ConsentPurpose;
    action: ConsentAction;
    notice_version: string;
    language: 'en' | 'ta';
    source: 'mobile' | 'web' | 'admin' | 'import';
    recorded_by: { id: string; full_name: string } | null;
    created_at: string;
}

/**
 * A place returned by GET /geocode/search.
 *
 * Mirrors AreaResult in features/battery-stations/utils/geocode.ts, which the
 * backend's parser now produces — the shape is unchanged by the move to a
 * proxy, only where the parsing happens.
 */
export interface GeocodeArea {
    /** Stable within a result set; used as a list key only. */
    id: string;
    /** "Adyar" — what the rider recognises. */
    name: string;
    /** "Chennai, Tamil Nadu" — disambiguates same-named localities. */
    description: string;
    latitude: number;
    longitude: number;
}

// ---------------------------------------------------------------------------
// DPDPA — data-principal rights
// (mirrors apps/backend/src/modules/privacy/privacy.types.ts)
// ---------------------------------------------------------------------------

export type DpRequestType =
    | 'access_export'
    | 'correction'
    | 'erasure'
    | 'grievance'
    | 'nominee_update';

export type DpRequestStatus =
    | 'open'
    | 'in_progress'
    | 'awaiting_principal'
    | 'completed'
    | 'rejected'
    | 'withdrawn';

export interface ApiPrivacyRequest {
    id: string;
    /** Human-readable, e.g. "DPR-2026-000042" — what the rider quotes to us. */
    reference: string;
    type: DpRequestType;
    status: DpRequestStatus;
    details: string | null;
    requested_changes: Record<string, string> | null;
    sla_due_at: string;
    /** Erasure only: nothing is destroyed before this. */
    grace_ends_at: string | null;
    resolution_notes: string | null;
    rejection_reason: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string | null;
}

/** Fields a rider cannot self-edit and must therefore ask us to correct. */
export type CorrectableField =
    | 'full_name'
    | 'date_of_birth'
    | 'aadhaar_details'
    | 'driving_licence_details'
    | 'other';

export interface ApiNominee {
    full_name: string | null;
    relationship: string | null;
    phone: string | null;
    email: string | null;
    updated_at: string | null;
}

export interface ApiExportResult {
    request: ApiPrivacyRequest;
    url: string;
    expires_in: number;
}
