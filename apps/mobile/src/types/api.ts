/**
 * Mirrors apps/backend/src/types/index.ts and the module response shapes.
 * Kept hand-written rather than generated so the mobile app depends on the
 * API contract, not on the backend's internal row types.
 */

/**
 * Three values, on one column.
 *
 * `roles`/`user_roles` collapsed into `users.role`, and `technician` and
 * `station_manager` did not survive: they were role names with no distinct
 * grants behind them, and what they reached for is now expressed by giving an
 * account the operations permissions instead.
 */
export type RoleName = 'rider' | 'staff' | 'admin';
export const ROLE_NAMES: RoleName[] = ['rider', 'staff', 'admin'];

export type AccountStatus = 'active' | 'inactive' | 'suspended';
export const ACCOUNT_STATUSES: AccountStatus[] = ['active', 'inactive', 'suspended'];

export type KycStatus = 'not_submitted' | 'pending' | 'partially_verified' | 'verified' | 'rejected';
export const KYC_STATUSES: KycStatus[] = [
    'not_submitted', 'pending', 'partially_verified', 'verified', 'rejected',
];

/**
 * `driving_licence`, with a C.
 *
 * The app spelled it `driving_license`; `kyc_document_type` spells it
 * `driving_licence`, and the enum is the authority. Sending the American
 * spelling is not a display quirk — it fails the insert, so a rider's licence
 * upload would have been rejected outright.
 */
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
    /** Has the rider completed the initial onboarding profile form (spec Step 1)? */
    profile_completed: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    /** One value now — `users.role`. Was an array off `user_roles`. */
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
    /** `kyc_documents.document_type`. Was `doc_type`. */
    document_type: KycDocType;
    /**
     * Display-only tail, e.g. "•••• 0124". The full Aadhaar/DL number is
     * validated at upload and deliberately never stored, so there is no
     * unmasked form of this field anywhere in the system.
     */
    doc_number_masked: string | null;
    verification_status: VerificationStatus;
    rejection_reason: string | null;
    /** `kyc_documents.expires_on`. Was `expires_on`. */
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

/** POST /payments/bookings/order — pay-first: creates a payment intent, not a booking. */
export type CreateBookingOrderPayload = CreateBookingPayload;

/**
 * `booked` is `reserved`, and `scrap` is `retired`.
 *
 * Read-only either way: `recompute_vehicle_status()` derives it from the
 * vehicle's maintenance ticket, rental assignment and booking hold.
 */
export type VehicleStatus = 'available' | 'reserved' | 'assigned' | 'maintenance' | 'retired';

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
    /**
     * When an unpaid hold lapses, ISO-8601. Null once the booking is no
     * longer pending. A `pending_payment` booking is NOT a confirmed
     * pickup — it is a scooter held on a clock — and the UI must say so.
     */
    hold_expires_at: string | null;
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
     * When this checkout session stops being collectable, ISO-8601. The
     * scooter hold expires with it.
     */
    expiresAt: string | null;
    /**
     * The itemised breakdown behind `amount`, computed server-side.
     *
     * The app MUST render this rather than adding up plan price + deposit
     * itself: pricing rules (transaction fee, welcome discount, plan-scoped
     * charges) are resolved by the backend and are invisible to the client.
     * Computing locally is what made the review screen quote a total the
     * gateway then disagreed with.
     */
    lines: ApiOrderLine[];
}

/**
 * The bill for a plan, resolved server-side, shown BEFORE checkout.
 *
 * The app cannot compute this: pricing rules (welcome discount, fees) live
 * in the database and are invisible on-device. Adding `plan.price +
 * deposit` locally is what made the review screen quote a total that
 * Razorpay then disagreed with.
 */
export interface ApiPlanQuote {
    lines: ApiOrderLine[];
    /** Rupees. The sum of `lines`, computed server-side. */
    amount: number;
    currency: string;
}

export interface ApiOrderLine {
    description: string;
    /** Rupees. Negative for a discount. */
    amount: number;
}

/**
 * The `mock` flag is gone.
 *
 * It meant "the backend has no Razorpay keys, so it already settled this
 * order — skip Checkout and treat it as paid", and the app honoured it. Any
 * deploy with a blank secret therefore confirmed bookings for free. There is
 * no longer a path where a payment succeeds without the gateway saying so, on
 * either side.
 */

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

/** `subscriptions.status`, narrowed. `due` was renamed `past_due`. */
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
    /** 'scheduled' once an on-time/early renewal has been paid but not yet activated — see returnPolicy.ts's getRenewalEligibility. */
    renewal_status: RenewalStatus;
    scheduled_start_date: string | null;
    scheduled_duration_days: number | null;
}

/** Why the invoice exists. Was `InvoicePaymentType` (rental/deposit/damage/...). */
export type InvoicePurpose = 'initial' | 'subscription_period' | 'settlement' | 'adhoc';

/**
 * Paid-ness, DERIVED by the backend from the money actually allocated.
 *
 * Was `InvoicePaymentStatus` ('pending' | 'processing' | 'succeeded' | ...),
 * read off an `invoices.payment_status` column that no longer exists — the
 * flag was removed precisely because it could disagree with the payments.
 */
export type InvoicePaymentState = 'paid' | 'partial' | 'overdue' | 'unpaid';

/** A single invoice line. */
export interface ApiInvoiceItem {
    id: string;
    item_type: 'plan_fee' | 'adjustment' | 'deposit';
    /** Was `rider_charge_id`. */
    subscription_adjustment_id: string | null;
    /** Was `label`. */
    description: string;
    quantity: number;
    unit_amount: number;
    /** Negative for a discount — there is no separate discount line type. */
    amount: number;
    created_at: string;
}

export interface ApiInvoice {
    id: string;
    /** Gap-free, allocated by the database. */
    invoice_number: string;
    /** Was `payment_type`. */
    purpose: InvoicePurpose;
    status: 'draft' | 'issued' | 'void';
    /** Was `amount_due`. */
    total_amount: number;
    subtotal_amount: number;
    /** What is still owed after allocations. */
    balance_amount: number;
    allocated_amount: number;
    /** Was `due_date`. A date — an IST calendar day. */
    due_on: string | null;
    /** Was `payment_status`. Derived, not stored. */
    payment_state: InvoicePaymentState;
    paid_at: string | null;
    /** How it was paid — `payment_transactions.method`. Null until paid. */
    payment_method: 'upi' | 'card' | 'netbanking' | 'wallet' | 'cash' | null;
    created_at: string;
    items: ApiInvoiceItem[];
    /** Only ever set on GET /invoices/me for an unpaid PERIOD invoice that is late — see the backend's InvoiceRow.late_fee doc comment. */
    late_fee?: number;
    days_late?: number;
    total_due?: number;
}

export interface ApiEarlyRechargeLineItem {
    /** Matches the DB enum invoice_item_type — there is no separate 'discount' type; a discount is an 'adjustment' with a negative amount. */
    itemType: 'plan_fee' | 'adjustment' | 'deposit';
    label: string;
    amount: number;
}

/** POST /bookings/me/:id/recharge — the just-generated (or already-pending) upcoming-period invoice, ready to review then pay. Generating it never charges anything by itself. */
export interface ApiEarlyRecharge {
    invoiceId: string;
    amountDue: number;
    dueDate: string;
    items: ApiEarlyRechargeLineItem[];
    /** True once next_due_at has already passed — lateFee applies and paying activates the new period immediately. */
    isLate: boolean;
    lateFee: number;
    /** Whole days past next_due_at — lateFee = daysLate * feePerDay. */
    daysLate: number;
    feePerDay: number;
    /** amountDue + lateFee — what actually gets charged. */
    total: number;
    /** When the renewed period will actually start: today if late, next_due_at (unchanged) if on-time/early. */
    scheduledStartDate: string;
}

/**
 * Four values, not five. `partially_refunded` and `refunded` collapsed into
 * `released` — how much came back is the refund's business, and the deposit
 * row no longer duplicates an amount the refund already knows.
 */
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
    /** Deposit minus non-disputed damage deductions — the deposit's own amount when not yet `held`. */
    refundable_amount: number;
}

/**
 * `recorded` is `assessed`; `settled` and `waived` are new terminal states —
 * a scratch written off previously had nowhere to go.
 */
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

/**
 * Three values. `cancelled` is gone: a rental that never really happened is a
 * booking that was cancelled, and no rental row should have existed for it.
 */
export type RentalStatus = 'active' | 'completed' | 'force_ended';

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
    current_period_start: string | null;
    /** 'scheduled' once an on-time/early renewal has been paid but not yet activated. */
    renewal_status: RenewalStatus | null;
    scheduled_start_date: string | null;

    // --- post-pickup return request (null until the rider asks to return) ---
    // The rental stays 'active' while a return is pending; only staff
    // confirming the physical handover ends it and settles the fee below.
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    days_late: number | null;
    late_penalty_amount: number | null;
    /**
     * The rate a SETTLED late-return fee was charged at — null until there is
     * a settlement. For the rate in force (what the rider's warning copy has
     * to quote before anything is settled) read `late_return_fee_per_day`
     * below, which is always present.
     */
    late_fee_per_day: number | null;

    // --- return recovery (20260824100000) -----------------------------------
    // Set once by vehicle-recovery-sweep when the rental is more than
    // max_late_fee_days past its due date; never cleared. Can be set even
    // with no return ever requested — see ReturnStatusCard.
    recovery_flagged_at: string | null;
    /** return_recovery_settings.max_late_fee_days — pass into computeLateReturnPenalty as maxDays. */
    max_late_fee_days: number;
    /** return_recovery_settings.late_fee_per_day — admin-configured ₹/day rate, always present (unlike late_fee_per_day above, which is settlement-only). Pass into computeLateReturnPenalty as feePerDay. */
    late_return_fee_per_day: number;
}

// ---------------------------------------------------------------------------
// Overdue Rider → Late Fee Payment → Scooter Return
//
// Distinct from RentalReturnFields above: this is the RENEWAL late fee
// (pricing_rules code='late_fee') for a plan that lapsed without ever being
// renewed, not the return-lateness fee for a scooter coming back late after
// a return was already requested. See apps/backend/src/modules/rentals/
// overdueLateFee.ts for the full explanation.
// ---------------------------------------------------------------------------

export interface ApiOverdueLateFee {
    /** RETURN-path day count: the handover day counts, because the rider rode the scooter through it. */
    daysLate: number;
    /** RETURN-path money — what the Return sheet collects and the adhoc invoice is raised for. */
    lateFee: number;
    isLate: boolean;
    feePerDay: number;
    dueOn: string | null;
    /** RENEW-path day count. Always one less than daysLate: the renewal payment buys today as plan time. */
    renewalDaysLate: number;
    /** RENEW-path money — what Home's renew banner must quote, since its call to action is "Renew Plan Now". */
    renewalLateFee: number;
    /** True once paid (or if nothing was ever owed) — the Return flow is unblocked. */
    isSettled: boolean;
}

// ---------------------------------------------------------------------------
// Vehicle Return → Inspection → Payment Gate → Approve Return
//
// The rider's own view of the SAME state machine the admin Return Detail
// page drives (apps/backend/src/modules/returns/returns.types.ts's
// ReturnStage / apps/web's ReturnStage) — computed server-side so the rider
// and admin can never see two different answers to "what's happening with
// my return."
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Return & Settlement — mirrors apps/backend/src/modules/returns/returns.types.ts
// ---------------------------------------------------------------------------

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
    /** What the rider paid directly (beyond the deposit) toward total_charges — survives due_amount reading 0 once that payment is confirmed. */
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

/** `maintenance_status` gained a `triaged` state between reported and in progress. */
export type MaintenanceStatus =
    'reported' | 'triaged' | 'in_progress' | 'resolved' | 'cancelled';

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
/**
 * `replacement` is new — a permanent swap, where `temp_vehicle` is a loan the
 * rider gives back. The old schema could not tell the two apart.
 */
export type MaintenanceNoticeStage =
    'pending_triage' | 'quick_fix' | 'temp_vehicle' | 'replacement';

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

/**
 * The rider's DPDPA s.11 summary.
 *
 * A summary, not a copy: `categories` carries counts rather than rows, and
 * `shared_with` is s.11(1)(b) — the processors the data reaches, which is not
 * derivable from the rider's own records.
 */
export interface ApiPrivacySummary {
    generated_at: string;
    controller: string;
    identity: {
        full_name: string | null;
        email: string | null;
        phone: string | null;
        date_of_birth: string | null;
        gender: string | null;
        address: string | null;
        kyc_status: string | null;
        identity_documents: { document_type: string; last4: string | null; status: string }[];
    };
    categories: {
        key: string;
        label: string;
        what: string;
        count: number;
        retention: string;
    }[];
    consents: { purpose: string; granted: boolean; decided_at: string | null }[];
    shared_with: { name: string; receives: string; why: string }[];
    not_held: string[];
}
