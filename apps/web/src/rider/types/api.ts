/**
 * Ported verbatim from apps/mobile/src/types/api.ts — keep in sync.
 *
 * Mirrors apps/backend/src/types/index.ts and the module response shapes.
 * Kept hand-written rather than generated so the rider web app depends on the
 * API contract, not on the backend's internal row types. This is a third copy
 * alongside the backend and the mobile app; the mobile file is the reference.
 */

export type RoleName = 'rider' | 'staff' | 'admin';
export const ROLE_NAMES: RoleName[] = ['rider', 'staff', 'admin'];

export type AccountStatus = 'active' | 'inactive' | 'suspended';
export const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'inactive', 'suspended'];

export type KycStatus = 'not_submitted' | 'pending' | 'partially_verified' | 'verified' | 'rejected';
export const KYC_STATUSES: KycStatus[] = [
    'not_submitted', 'pending', 'partially_verified', 'verified', 'rejected',
];

export type KycDocType = 'aadhaar' | 'driving_licence' | 'passport' | 'voter_id' | 'address_proof';
export const MANDATORY_KYC_DOC_TYPES: KycDocType[] = ['aadhaar', 'driving_licence'];

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
    profile_completed: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    role: RoleName;
    assigned_vehicle: { id: string; vin: string; model: string } | null;
    current_plan: { id: string; name: string; status: string } | null;
}

export interface ApiUserDetail extends ApiUser {
    kyc_completion_percent: number;
    documents: Array<{
        id: string;
        document_type: KycDocType;
        doc_number_masked: string | null;
        verification_status: VerificationStatus;
        rejection_reason: string | null;
        expires_on: string | null;
        submitted_at: string | null;
        verified_at: string | null;
    }>;
}

/** GET /users/me adds the flags the UI gates on. */
export interface ApiMe extends ApiUserDetail {
    can_rent: boolean;
    is_admin: boolean;
    has_active_rental: boolean;
    has_active_booking: boolean;
    consent_up_to_date: boolean;
    consent_notice_version: string;
}

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
    document_type: KycDocType;
    doc_number_masked: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    expires_on: string | null;
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

// --- Vehicle catalog -------------------------------------------------------

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
    image_url: string | null;
    starting_price: number | null;
    availability: ApiAvailability;
}

export interface ApiVehicleModelDetail extends ApiVehicleModel {
    description: string | null;
    motor_power_watts: number | null;
    battery_capacity: string | null;
    features: string[];
    safety_features: string[];
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

// --- Booking -------------------------------------------------------------

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

/** POST /payments/bookings/order — pay-first: creates a payment intent, not a booking. */
export type CreateBookingOrderPayload = CreateBookingPayload;

export type VehicleStatus = 'available' | 'reserved' | 'assigned' | 'maintenance' | 'retired';

export type BookingRefundStatus = 'pending' | 'processing' | 'processed' | 'not_required' | 'failed';

export interface ApiBooking {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    hold_expires_at: string | null;
    vehicle_model: { id: string; name: string } | null;
    station: { id: string; name: string; code: string; lat: number; lng: number } | null;
    plan: {
        id: string; name: string; billing_cycle: BillingCycle; price: number;
        duration_days: number; deposit_amount: number;
    } | null;
    vehicle: {
        id: string; name: string; registration_number: string; battery_percentage: number;
        status: VehicleStatus;
    } | null;
    referral_discount_amount: number | null;

    cancelled_at: string | null;
    cancellation_reason: string | null;
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

// --- Payments ----------------------------------------------------------

export interface ApiPaymentOrder {
    orderId: string;
    gatewayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
    expiresAt: string | null;
    lines: ApiOrderLine[];
}

export interface ApiPlanQuote {
    lines: ApiOrderLine[];
    amount: number;
    currency: string;
}

export interface ApiOrderLine {
    description: string;
    amount: number;
}

export interface VerifyPaymentPayload {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}

// --- Rider billing ---------------------------------------------------

export type PlanStatus = 'active' | 'past_due' | 'paused';
export type RenewalStatus = 'none' | 'scheduled';

export interface ApiBookingWithPlan extends ApiBooking {
    plan_status: PlanStatus | null;
    plan_activated_at: string | null;
    plan_duration_days: number | null;
    deposit_amount_at_booking: number | null;
    current_period_start: string | null;
    next_due_at: string | null;
    plan_paused_at: string | null;
    plan_paused_days_total: number;
    renewal_status: RenewalStatus;
    scheduled_start_date: string | null;
    scheduled_duration_days: number | null;
}

export type InvoicePurpose = 'initial' | 'subscription_period' | 'settlement' | 'adhoc';

export type InvoicePaymentState = 'paid' | 'partial' | 'overdue' | 'unpaid';

export interface ApiInvoiceItem {
    id: string;
    item_type: 'plan_fee' | 'adjustment' | 'deposit';
    subscription_adjustment_id: string | null;
    description: string;
    quantity: number;
    unit_amount: number;
    amount: number;
    created_at: string;
}

export interface ApiInvoice {
    id: string;
    invoice_number: string;
    purpose: InvoicePurpose;
    status: 'draft' | 'issued' | 'void';
    total_amount: number;
    subtotal_amount: number;
    balance_amount: number;
    allocated_amount: number;
    due_on: string | null;
    payment_state: InvoicePaymentState;
    paid_at: string | null;
    payment_method: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cash' | null;
    created_at: string;
    items: ApiInvoiceItem[];
    late_fee?: number;
    days_late?: number;
    total_due?: number;
}

export interface ApiEarlyRechargeLineItem {
    itemType: 'plan_fee' | 'adjustment' | 'deposit';
    label: string;
    amount: number;
}

export interface ApiEarlyRecharge {
    invoiceId: string;
    amountDue: number;
    dueDate: string;
    items: ApiEarlyRechargeLineItem[];
    isLate: boolean;
    lateFee: number;
    daysLate: number;
    feePerDay: number;
    total: number;
    scheduledStartDate: string;
}

export type DepositStatus = 'pending' | 'held' | 'released' | 'forfeited';

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
    refundable_amount: number;
}

export type DamageStatus = 'assessed' | 'disputed' | 'settled' | 'waived';

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

export type RentalStatus = 'active' | 'completed' | 'force_ended';

export interface ApiRental {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    booking_id: string | null;
    vehicle: {
        id: string;
        name: string;
        registration_number: string;
        battery_percentage: number;
        next_service_due_date: string | null;
    } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: BillingCycle; price: number } | null;

    plan_id: string | null;
    plan_duration_days: number | null;
    plan_price_at_pickup: number | null;
    expires_at: string | null;

    plan_status: PlanStatus | null;
    next_due_at: string | null;
    current_period_start: string | null;
    renewal_status: RenewalStatus | null;
    scheduled_start_date: string | null;

    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    days_late: number | null;
    late_penalty_amount: number | null;
    late_fee_per_day: number | null;

    recovery_flagged_at: string | null;
    max_late_fee_days: number;
    late_return_fee_per_day: number;
}

/**
 * Two prices for one lapsed plan. `daysLate`/`lateFee` are the RETURN figures
 * (the handover day counts); `renewalDaysLate`/`renewalLateFee` are the RENEW
 * figures (one day less — the renewal buys today). Quote them in matched
 * pairs, never a day count from one exit beside money from the other.
 */
export interface ApiOverdueLateFee {
    isLate: boolean;
    daysLate: number;
    feePerDay: number;
    lateFee: number;
    dueOn: string | null;
    renewalDaysLate: number;
    renewalLateFee: number;
    isSettled: boolean;
}

export type ReturnStageStatus =
    | 'return_requested' | 'payment_required' | 'payment_submitted'
    | 'ready_for_approval' | 'return_completed' | 'rejected';

export interface ApiReturnStage {
    status: ReturnStageStatus;
    depositAmount: number;
    damageAmount: number;
    otherChargesAmount: number;
    totalCharges: number;
    additionalDue: number;
    refundDue: number;
    additionalDueInvoiceId: string | null;
    paymentVerifiedAt: string | null;
}

export interface ApiOverdueLateFeeInvoice {
    invoiceId: string;
    amount: number;
    isPaid: boolean;
}

export type ReturnSettlementStatus =
    | 'pending_refund' | 'refund_processing' | 'refund_completed'
    | 'no_refund_required' | 'amount_due' | 'settlement_completed';

export interface ApiOtherCharge {
    label: string;
    amount: number;
}

export interface ApiReturnSettlement {
    id: string;
    rental_id: string;
    booking_id: string;
    vehicle_id: string;
    deposit_amount: number;
    late_fee_amount: number;
    damage_fee_amount: number;
    other_charges: ApiOtherCharge[];
    other_charges_amount: number;
    total_charges: number;
    net_settlement: number;
    refund_amount: number;
    due_amount: number;
    paid_by_rider_amount: number;
    status: ReturnSettlementStatus;
    refund_id: string | null;
    due_invoice_id: string | null;
    created_at: string;
    processed_at: string | null;
}

export interface ReturnRequestPayload {
    reason: string;
    feedback?: string;
    rating: number;
}

export type MaintenanceStatus =
    'reported' | 'triaged' | 'in_progress' | 'resolved' | 'cancelled';

export interface ApiMaintenanceRecord {
    id: string;
    status: MaintenanceStatus;
    description: string;
    resolved_at: string | null;
    created_at: string;
    expected_ready_at: string | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
}

export interface MaintenanceHistoryParams {
    page?: number;
    pageSize?: number;
    status?: MaintenanceStatus;
    vehicleId?: string;
}

export type MaintenanceNoticeStage =
    'pending_triage' | 'quick_fix' | 'temp_vehicle' | 'replacement';

export interface ApiMaintenanceNotice {
    ticket_id: string;
    stage: MaintenanceNoticeStage;
    expected_ready_at: string | null;
    temp_vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
}

// --- DPDPA consent (mirrors apps/backend consent.types.ts) -------------

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
    up_to_date: boolean;
    items: ApiConsentItem[];
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
