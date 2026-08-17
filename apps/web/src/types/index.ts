// ---------------------------------------------------------------------------
// Auth / roles
// ---------------------------------------------------------------------------

/** Full role vocabulary the backend's types.ts defines (apps/backend/src/types/index.ts).
 * All five now exist in the DB enum — staff / technician / station_manager were
 * added by supabase/migrations/20260814100000_dpdpa_enums.sql. */
export type BackendRoleName = "rider" | "staff" | "technician" | "station_manager" | "admin";

/** What the web console's nav/route-guarding cares about. */
export type Role = "admin" | "staff";

/**
 * TWO LAYERS OF STAFF AUTHORISATION — see the same note in
 * apps/backend/src/types/index.ts. ModuleKey = which sections you may OPEN.
 * Capability = whether you may see RAW PERSONAL DATA inside them. They
 * compose; neither replaces the other.
 */

/**
 * Modules a staff account can be individually granted access to. Mirrors
 * apps/backend/src/types/index.ts MODULE_KEYS — keep both lists in sync by
 * hand (no shared package exists in this monorepo).
 */
export type ModuleKey =
  | "vehicles" | "users" | "kyc" | "bookings" | "maintenance" | "support"
  | "payments" | "notifications" | "damages" | "refunds" | "privacy"
  | "plans" | "reconciliation" | "pii_access_log" | "audit" | "settings"
  | "dashboard" | "battery_stations" | "billing";
export const MODULE_KEYS: readonly ModuleKey[] = [
  "vehicles", "users", "kyc", "bookings", "maintenance", "support",
  "payments", "notifications", "damages", "refunds", "privacy",
  "plans", "reconciliation", "pii_access_log", "audit", "settings",
  "dashboard", "battery_stations", "billing",
];

/** Human-readable labels for the module-permission checkboxes in Settings. */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  vehicles: "Vehicles",
  users: "Users",
  kyc: "KYC Queue",
  bookings: "Bookings",
  maintenance: "Maintenance",
  support: "Support Tickets",
  payments: "Payments",
  notifications: "Notifications",
  damages: "Damage Review",
  refunds: "Refunds",
  privacy: "Privacy Requests",
  plans: "Plans",
  reconciliation: "Reconciliation",
  pii_access_log: "PII Access Log",
  audit: "Audit Log",
  settings: "Settings",
  dashboard: "Dashboard",
  battery_stations: "Battery Stations",
  billing: "Billing & Charges",
};

/**
 * Every module's grantable verbs, in the shape the permission matrix UI
 * renders directly. Mirrors apps/backend/src/types/index.ts MODULE_ACTIONS —
 * keep both in sync by hand (no shared package in this monorepo). `available:
 * false` means no backend route enforces it yet (or, for the couple of
 * UI-only ones like "view_kyc", no route ever will) — the matrix renders
 * those as disabled rather than omitting them, so the screen matches the
 * full permission spec even where enforcement doesn't exist behind it yet.
 */
export interface ModuleActionDef {
  key: string;
  label: string;
  available: boolean;
}

export const MODULE_ACTIONS: Record<ModuleKey, readonly ModuleActionDef[]> = {
  dashboard: [{ key: "view", label: "View", available: true }],
  vehicles: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: true },
    { key: "edit", label: "Edit", available: true },
    { key: "assign", label: "Assign / Unassign", available: true },
    { key: "maintenance", label: "Maintenance", available: false },
    { key: "delete", label: "Delete", available: true },
  ],
  users: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: false },
    { key: "edit", label: "Edit", available: true },
    { key: "suspend", label: "Suspend / Activate", available: true },
    { key: "delete", label: "Delete", available: false },
    { key: "view_kyc", label: "View KYC", available: true },
  ],
  kyc: [
    { key: "view", label: "View", available: true },
    { key: "review", label: "Review / Approve / Reject", available: true },
  ],
  bookings: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: false },
    { key: "edit", label: "Edit", available: true },
    { key: "cancel", label: "Cancel", available: true },
    { key: "assign_vehicle", label: "Assign Vehicle", available: false },
  ],
  maintenance: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: true },
    { key: "edit", label: "Edit", available: true },
    { key: "complete", label: "Complete", available: true },
    { key: "delete", label: "Delete", available: false },
  ],
  support: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: false },
    { key: "reply", label: "Reply / Resolve", available: true },
    { key: "resolve", label: "Resolve (see Reply)", available: false },
    { key: "delete", label: "Delete", available: false },
  ],
  payments: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: false },
    { key: "refund", label: "Refund", available: true },
    { key: "export", label: "Export", available: false },
  ],
  plans: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: true },
    { key: "edit", label: "Edit / Activate / Deactivate", available: true },
    { key: "delete", label: "Delete", available: false },
  ],
  reconciliation: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: false },
    { key: "approve", label: "Approve", available: false },
    { key: "export", label: "Export", available: false },
  ],
  notifications: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: false },
    { key: "send", label: "Send", available: true },
    { key: "delete", label: "Delete", available: false },
  ],
  privacy: [
    { key: "view", label: "View", available: true },
    { key: "process", label: "Approve / Reject / Process", available: true },
  ],
  pii_access_log: [
    { key: "view", label: "View", available: true },
    { key: "export", label: "Export", available: false },
  ],
  audit: [
    { key: "view", label: "View", available: true },
    { key: "export", label: "Export", available: false },
  ],
  settings: [
    { key: "view", label: "View", available: true },
    { key: "edit", label: "Edit", available: true },
  ],
  battery_stations: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create", available: true },
    { key: "edit", label: "Edit", available: true },
    { key: "delete", label: "Delete", available: true },
  ],
  damages: [
    { key: "view", label: "View", available: true },
    { key: "resolve", label: "Resolve", available: true },
  ],
  refunds: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Process", available: true },
  ],
  billing: [
    { key: "view", label: "View", available: true },
    { key: "create", label: "Create Charge Rule", available: true },
    { key: "edit", label: "Edit Charge Rule / Waive Charge", available: true },
  ],
};

/** A single module's granted verbs — what staff_permissions actually stores per row. */
export interface ModulePermission {
  module_key: ModuleKey;
  actions: string[];
}

/**
 * Orthogonal to both role and module: whether the holder may see raw rider
 * personal data. Never implied by a role or a module — an admin without
 * kyc_reviewer cannot open an Aadhaar scan. The console uses these to hide
 * controls; the backend enforces them regardless.
 */
export type Capability = "kyc_reviewer" | "rights_officer" | "pii_exporter";

export const CAPABILITY_LABELS: Record<Capability, { label: string; description: string }> = {
  kyc_reviewer: {
    label: "KYC reviewer",
    description: "Open identity-document images and the KYC detail view, and verify or reject documents.",
  },
  rights_officer: {
    label: "Rights officer",
    description: "Work the data-principal request queue (access, correction, erasure, grievance).",
  },
  pii_exporter: {
    label: "PII exporter",
    description: "Generate a personal-data export on a rider's behalf for an off-app request.",
  },
};

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Every backend role the account actually holds (for future fine-grained UI). */
  roles: BackendRoleName[];
  /** null = unrestricted (admin). Array = exact granted module+action pairs (staff). */
  permissions: ModulePermission[] | null;
  /** Capabilities granting access to raw personal data. Empty for most staff. */
  capabilities: Capability[];
  avatarUrl?: string;
  phone?: string;
}

// ---------------------------------------------------------------------------
// Users — mirrors apps/backend/src/modules/users/users.types.ts
// ---------------------------------------------------------------------------

export type AccountStatus = "active" | "inactive" | "suspended";
export type KycStatus = "not_submitted" | "pending" | "partially_verified" | "verified" | "rejected";

export interface AppUser {
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
  staff_code: string | null;
  last_login_at: string | null;
  roles: BackendRoleName[];
  assigned_vehicle: { id: string; vin: string; model: string; name: string; registration_number: string } | null;
  current_plan: { id: string; name: string; price: number; billing_cycle: string } | null;
  /**
   * bookings.status before pickup (pending_payment/confirmed), or
   * bookings.plan_status (active/due/paused) once fulfilled. Null when the
   * rider has no live booking at all.
   */
  payment_status: "pending_payment" | "confirmed" | "active" | "due" | "paused" | null;
}

export interface AppUserDocument {
  id: string;
  doc_type: string;
  /** See KycDocumentDetail.doc_number_masked — masked is the only form. */
  doc_number_masked: string | null;
  verification_status: string;
  rejection_reason: string | null;
  expiry_date: string | null;
  submitted_at: string | null;
  verified_at: string | null;
}

export interface AppUserDetail extends AppUser {
  kyc_completion_percent: number;
  documents: AppUserDocument[];
}

// ---------------------------------------------------------------------------
// KYC queue — mirrors apps/backend/src/modules/kyc/kyc.service.ts
// ---------------------------------------------------------------------------

export interface KycQueueItem {
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

export interface KycDocumentDetail {
  id: string;
  doc_type: string;
  /**
   * Display-only tail, e.g. "•••• 0124". There is no unmasked counterpart:
   * the full Aadhaar/DL number is validated at upload and never stored.
   */
  doc_number_masked: string | null;
  verification_status: string;
  rejection_reason: string | null;
  expiry_date: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  has_back_side: boolean;
}

export interface KycDetail {
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
  documents: KycDocumentDetail[];
  history: unknown[];
}

// ---------------------------------------------------------------------------
// Support tickets — mirrors apps/backend/src/modules/support/support.types.ts
// ---------------------------------------------------------------------------

export type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportPriority = "low" | "medium" | "high" | "urgent";

export interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  status: SupportStatus;
  priority: SupportPriority;
  resolved_at: string | null;
  created_at: string;
  rider: { id: string; full_name: string; phone: string | null };
  assigned_to: string | null;
  rental_id: string | null;
  vehicle_id: string | null;
}

// ---------------------------------------------------------------------------
// Bookings (staff pickup queue) — mirrors
// apps/backend/src/modules/bookings/bookings.types.ts
// ---------------------------------------------------------------------------

/**
 * 'completed' (20260811100000): the rider returned the scooter for good.
 * Distinct from 'fulfilled', which now means "picked up and still riding"
 * (plan_status active/due/paused) — before this, a fulfilled booking never
 * had a terminal state at all.
 */
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired" | "fulfilled" | "completed";
export type BookingPlanStatus = "active" | "due" | "paused";

/**
 * 'pending': legacy value, no longer written. 'processing': a real Razorpay
 * refund has been submitted and is in flight ("Refund Initiated"). 'processed':
 * the gateway confirmed it ("Refunded"). 'failed': the gateway call failed,
 * needs a staff retry. 'not_required': nothing was ever paid, or the refund
 * works out to zero.
 */
export type BookingRefundStatus = "pending" | "processing" | "processed" | "not_required" | "failed";

/**
 * The rental this booking's handover opened (bookings.active_rental_id) —
 * just enough of the rental's own return-request/settlement state for the
 * Rental Operations screen to show a pending return without a second
 * fetch. Null for anything pre-pickup.
 */
export interface PickupBookingActiveRental {
  id: string;
  status: string;
  started_at: string;
  return_requested_at: string | null;
  return_reason: string | null;
  return_feedback: string | null;
  return_due_at: string | null;
  return_approved_at: string | null;
}

export interface PickupBooking {
  id: string;
  status: BookingStatus;
  start_day: string;
  created_at: string;
  vehicle_model: { id: string; name: string } | null;
  station: { id: string; name: string; code: string; lat: number; lng: number } | null;
  plan: { id: string; name: string; billing_cycle: string; price: number; duration_days: number } | null;
  rider: { id: string; full_name: string; phone: string | null };
  /** The physical unit already reserved by allocate_vehicle_for_booking(), if any. */
  vehicle: { id: string; name: string; registration_number: string; battery_percentage: number; status: VehicleStatus } | null;
  /** Recurring-billing state — set once the booking reaches 'fulfilled', null before and after (see BookingStatus). */
  plan_status: BookingPlanStatus | null;
  next_due_at: string | null;
  active_rental: PickupBookingActiveRental | null;
  /** Live estimate of the late-return fee if this booking's pending return were approved right now. Null unless one is pending. */
  return_late_fee_preview: { days_late: number; penalty_amount: number; fee_per_day: number } | null;

  // --- pre-pickup cancellation (all null unless the rider/staff cancelled) ---
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_penalty_amount: number | null;
  refund_amount: number | null;
  refund_status: BookingRefundStatus | null;
  refund_initiated_at: string | null;
  refund_completed_at: string | null;
  refund_transaction_id: string | null;
}

export interface AvailableVehicle {
  id: string;
  name: string;
  registration_number: string;
  battery_percentage: number;
}

// ---------------------------------------------------------------------------
// Vehicles (fleet inventory) — mirrors apps/backend/src/modules/vehicles/vehicles.types.ts
// ---------------------------------------------------------------------------

/** Matches the live public.vehicle_status enum (available/booked/assigned/maintenance/scrap). */
export type VehicleStatus = "available" | "booked" | "assigned" | "maintenance" | "scrap";

export interface Vehicle {
  id: string;
  name: string;
  registration_number: string;
  battery_number: string;
  manufacturer: string;
  model: string;
  vin: string;
  /** Manually recorded today; will become live telemetry once a 3rd-party GPS/IoT integration ships. */
  battery_percentage: number;
  status: VehicleStatus;
  last_service_date: string | null;
  next_service_due_date: string | null;
  active: boolean;
  color: string | null;
  qr_code: string | null;
  imei: string | null;
  purchase_date: string | null;
  insurance_number: string | null;
  insurance_expiry: string | null;
  created_at: string;
  updated_at: string | null;
  /**
   * Billing state of whichever booking currently holds this vehicle —
   * 'pending_payment'/'confirmed' before pickup, 'active'/'due'/'paused'
   * once the rental's underway. null when no live booking holds it.
   */
  payment_status: "pending_payment" | "confirmed" | "active" | "due" | "paused" | null;
}

export interface VehicleDocument {
  id: string;
  doc_type: "registration" | "insurance";
  doc_number: string;
  issued_date: string;
  expiry_date: string;
}

export interface VehiclePhoto {
  id: string;
  /** Signed URL, minted per request. */
  url: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface VehicleMaintenanceRecord {
  id: string;
  status: "reported" | "in_progress" | "resolved" | "cancelled";
  description: string;
  resolved_at: string | null;
  created_at: string;
  outcome: "quick_fix" | "standard_temp" | "not_repairable" | null;
  expected_ready_at: string | null;
  /** Set when outcome = standard_temp: the vehicle handed to the rider while this one was repaired. */
  temp_vehicle: { id: string; name: string; registration_number: string } | null;
}

export interface VehicleRentalRecord {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  rider: { id: string; full_name: string } | null;
  /** Rider's post-pickup return request — null until they ask to hand the scooter back. */
  return_requested_at: string | null;
  return_reason: string | null;
  return_feedback: string | null;
  return_due_at: string | null;
}

export interface VehicleBookingRecord {
  id: string;
  status: string;
  plan_status: "active" | "due" | "paused" | null;
  start_day: string;
  created_at: string;
  rider: { id: string; full_name: string } | null;
}

export interface ScrapRecord {
  id: string;
  reason: string;
  scrapped_on: string;
  estimated_value: number | null;
  approved_by: { id: string; full_name: string } | null;
  created_at: string;
}

export interface VehicleDetail extends Vehicle {
  documents: VehicleDocument[];
  photos: VehiclePhoto[];
  maintenance_history: VehicleMaintenanceRecord[];
  rental_history: VehicleRentalRecord[];
  booking_history: VehicleBookingRecord[];
  current_rider: { id: string; full_name: string } | null;
  scrap_record: ScrapRecord | null;
}

// ---------------------------------------------------------------------------
// Maintenance (admin) — mirrors apps/backend/src/modules/maintenance/maintenance.types.ts
// ---------------------------------------------------------------------------

export type MaintenanceStatus = "reported" | "in_progress" | "resolved" | "cancelled";

/** Set once staff verify a displaced vehicle. Null until triaged. */
export type MaintenanceOutcome = "quick_fix" | "standard_temp" | "not_repairable";

export interface MaintenanceTicket {
  id: string;
  status: MaintenanceStatus;
  description: string;
  resolved_at: string | null;
  created_at: string;
  outcome: MaintenanceOutcome | null;
  expected_ready_at: string | null;
  triaged_at: string | null;
  vehicle: { id: string; name: string; registration_number: string } | null;
  reported_by: { id: string; full_name: string } | null;
  triaged_by: { id: string; full_name: string } | null;
  displaced_rider: { id: string; full_name: string } | null;
  temp_vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
  replacement_vehicle: { id: string; name: string; registration_number: string } | null;
}

// ---------------------------------------------------------------------------
// Notifications (admin) — mirrors apps/backend/src/modules/notifications/notifications.types.ts
// ---------------------------------------------------------------------------

export type NotificationChannel = "sms" | "push" | "email";
export type NotificationDeliveryStatus = "sent" | "failed" | "pending";

export interface NotificationLogEntry {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  template: string;
  payload: { title: string; body: string; screen?: string } | null;
  status: NotificationDeliveryStatus;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  rider: { id: string; full_name: string } | null;
}

export interface BroadcastResult {
  template: string;
  targeted: number;
  sent: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Invoices / payments (admin) — mirrors apps/backend/src/modules/invoices/invoices.types.ts
// ---------------------------------------------------------------------------

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "void";
export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "refunded";
export type PaymentMethod = "card" | "wallet" | "upi" | "cash";
export type PaymentType = "rental" | "deposit" | "damage" | "penalty" | "refund" | "other";

/** A single invoice line — see 20260817100000_billing_charge_engine.sql. Empty on every invoice minted before that migration. */
export interface InvoiceItem {
  id: string;
  item_type: "base_rental" | "charge" | "discount";
  rider_charge_id: string | null;
  label: string;
  amount: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string | null;
  rental_id: string | null;
  booking_id: string | null;
  payment_type: PaymentType | null;
  status: InvoiceStatus;
  amount_due: number;
  due_date: string;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  gateway_ref: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string | null;
  rider: { id: string; full_name: string; email: string | null } | null;
  items: InvoiceItem[];
}

export interface InvoiceDetail extends Invoice {
  plan: { id: string; name: string } | null;
  vehicle: { id: string; name: string; registration_number: string } | null;
}

// ---------------------------------------------------------------------------
// Plans (admin) — mirrors apps/backend/src/modules/plans/plans.types.ts
// ---------------------------------------------------------------------------

export type BillingCycle = "daily" | "weekly" | "monthly" | "yearly";

export interface Plan {
  id: string;
  name: string;
  billing_cycle: BillingCycle;
  price: number;
  included_minutes: number | null;
  duration_days: number;
  deposit_amount: number;
  vehicle_model_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
}

// ---------------------------------------------------------------------------
// Deposits (admin) — mirrors apps/backend/src/modules/deposits/deposits.types.ts
// ---------------------------------------------------------------------------

export type DepositStatus = "pending" | "held" | "partially_refunded" | "refunded" | "forfeited";

export interface Deposit {
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
  created_at: string;
}

// ---------------------------------------------------------------------------
// Damages (admin + rider) — mirrors apps/backend/src/modules/damages/damages.types.ts
// ---------------------------------------------------------------------------

export type DamageStatus = "recorded" | "disputed" | "resolved";

export interface Damage {
  id: string;
  booking_id: string;
  rental_id: string;
  reported_by: { id: string; full_name: string } | null;
  amount: number;
  description: string;
  photo_urls: string[];
  deposit_deduction: number;
  outstanding_amount: number;
  status: DamageStatus;
  created_at: string;
  disputed_at: string | null;
  disputed_by: { id: string; full_name: string } | null;
  dispute_reason: string | null;
  dispute_resolved_at: string | null;
  dispute_resolution_notes: string | null;
  disputed_amount_held: number | null;
}

// ---------------------------------------------------------------------------
// Refunds (admin) — mirrors apps/backend/src/modules/refunds/refunds.types.ts
// ---------------------------------------------------------------------------

export type RefundStatus = "pending" | "processing" | "success" | "failed";
export type RefundType = "deposit" | "booking_cancellation";

/** Only populated for refund_type='booking_cancellation'. */
export interface RefundBookingSummary {
  id: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_penalty_amount: number | null;
  plan_price_at_cancellation: number | null;
  vehicle_model_name: string | null;
  station_name: string | null;
  rider_name: string | null;
  rider_phone: string | null;
}

export interface Refund {
  id: string;
  deposit_id: string;
  booking_id: string;
  amount: number;
  status: RefundStatus;
  refund_type: RefundType;
  gateway_refund_id: string | null;
  source_gateway_payment_id: string | null;
  attempt_count: number;
  last_attempted_at: string | null;
  failure_reason: string | null;
  initiated_at: string;
  processed_at: string | null;
  created_at: string;
  booking: RefundBookingSummary | null;
}

// ---------------------------------------------------------------------------
// Billing & Charges (admin) — mirrors apps/backend/src/modules/billing/billing.types.ts
// ---------------------------------------------------------------------------

export type ChargeCode =
  | "transaction_fee" | "late_payment_fee" | "late_return_fee" | "damage"
  | "cleaning" | "cancellation" | "extension" | "other";
export const CHARGE_CODES: readonly ChargeCode[] = [
  "transaction_fee", "late_payment_fee", "late_return_fee", "damage",
  "cleaning", "cancellation", "extension", "other",
];
export const CHARGE_CODE_LABELS: Record<ChargeCode, string> = {
  transaction_fee: "Transaction Fee",
  late_payment_fee: "Late Payment Fee",
  late_return_fee: "Late Return Fee",
  damage: "Damage Charge",
  cleaning: "Cleaning Charge",
  cancellation: "Cancellation Charge",
  extension: "Extension Charge",
  other: "Other Charge",
};

export type ChargeAmountType = "fixed" | "percentage";
export type ChargeFrequencyType = "one_time" | "every_cycle" | "every_n_cycles" | "per_booking" | "per_day";
export const CHARGE_FREQUENCY_LABELS: Record<ChargeFrequencyType, string> = {
  one_time: "One time",
  every_cycle: "Every cycle",
  every_n_cycles: "Every N cycles",
  per_booking: "Per booking",
  per_day: "Per day",
};
export type ChargeRuleScope = "global" | "vehicle";
export type RiderChargeStatus = "pending" | "invoiced" | "paid" | "waived" | "cancelled";

export interface ChargeRule {
  id: string;
  charge_code: ChargeCode;
  charge_name: string;
  description: string | null;
  amount_type: ChargeAmountType;
  amount: number;
  frequency_type: ChargeFrequencyType;
  frequency_n: number | null;
  scope: ChargeRuleScope;
  vehicle_id: string | null;
  vehicle: { id: string; name: string; registration_number: string } | null;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiderChargeBookingSummary {
  id: string;
  rider_name: string | null;
  rider_phone: string | null;
  vehicle_model_name: string | null;
}

export interface RiderCharge {
  id: string;
  booking_id: string;
  charge_rule_id: string | null;
  charge_code: ChargeCode;
  charge_name: string;
  amount: number;
  billing_cycle_number: number | null;
  status: RiderChargeStatus;
  waived_amount: number | null;
  waived_reason: string | null;
  waived_by: { id: string; full_name: string } | null;
  waived_at: string | null;
  invoice_id: string | null;
  created_at: string;
  booking: RiderChargeBookingSummary | null;
}

// ---------------------------------------------------------------------------
// Discount Rules (admin) — mirrors Charge Rules exactly. See
// apps/backend/src/modules/billing/billing.types.ts.
// ---------------------------------------------------------------------------

export type DiscountCode = "loyalty" | "promotional" | "seasonal" | "referral" | "other";
export const DISCOUNT_CODES: readonly DiscountCode[] = [
  "loyalty", "promotional", "seasonal", "referral", "other",
];
export const DISCOUNT_CODE_LABELS: Record<DiscountCode, string> = {
  loyalty: "Loyalty Discount",
  promotional: "Promotional Discount",
  seasonal: "Seasonal Discount",
  referral: "Referral Discount",
  other: "Other Discount",
};

/** "Duration: N Billing Cycles" (spec) applies to cycles 1..N — distinct from a charge's every_n_cycles (multiples of N). */
export type DiscountFrequencyType = "one_time" | "every_cycle" | "first_n_cycles";
export const DISCOUNT_FREQUENCY_LABELS: Record<DiscountFrequencyType, string> = {
  one_time: "One time",
  every_cycle: "Every cycle",
  first_n_cycles: "First N cycles",
};
export type RiderDiscountStatus = "pending" | "applied" | "cancelled";

export interface DiscountRule {
  id: string;
  discount_code: DiscountCode;
  discount_name: string;
  description: string | null;
  discount_type: ChargeAmountType;
  value: number;
  frequency_type: DiscountFrequencyType;
  frequency_n: number | null;
  scope: ChargeRuleScope;
  vehicle_id: string | null;
  vehicle: { id: string; name: string; registration_number: string } | null;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiderDiscount {
  id: string;
  booking_id: string;
  discount_rule_id: string | null;
  discount_code: DiscountCode;
  discount_name: string;
  discount_type: ChargeAmountType;
  amount: number;
  billing_cycle_number: number | null;
  status: RiderDiscountStatus;
  cancel_reason: string | null;
  cancelled_by: { id: string; full_name: string } | null;
  cancelled_at: string | null;
  invoice_id: string | null;
  created_at: string;
  booking: RiderChargeBookingSummary | null;
}

// ---------------------------------------------------------------------------
// Reports (admin) — mirrors apps/backend/src/modules/reports/reports.types.ts
// ---------------------------------------------------------------------------

export interface ReportsSummary {
  vehicles: { total: number; by_status: Record<VehicleStatus, number> };
  riders: { total: number; by_kyc_status: Record<KycStatus, number> };
  revenue: { paid_total: number; pending_total: number; pending_count: number; refunded_total: number; invoice_count: number };
  maintenance: { by_status: Record<MaintenanceStatus, number> };
  plans: { active_subscriptions: number };
  bookings: { pending_count: number };
  rides: { active_count: number };
  trends: {
    revenue: { month: string; amount: number }[];
    bookings: { month: string; count: number }[];
    maintenance: { month: string; count: number }[];
  };
}

// ---------------------------------------------------------------------------
// Audit logs (admin)
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; full_name: string } | null;
  target_user: { id: string; full_name: string } | null;
}

// ---------------------------------------------------------------------------
// Ride management (admin) — mirrors apps/backend/src/modules/rentals/rentals.types.ts
// ---------------------------------------------------------------------------

export type RentalStatus = "active" | "completed" | "force_ended" | "cancelled";

export interface AdminRental {
  id: string;
  status: RentalStatus;
  started_at: string;
  ended_at: string | null;
  start_battery_pct: number | null;
  end_battery_pct: number | null;
  fare: number | null;
  rider: { id: string; full_name: string; phone: string | null } | null;
  vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;

  // Rider's post-pickup return request. The ride stays 'active' while one is
  // pending — closing it with "Complete ride" is what settles the late fee.
  return_requested_at: string | null;
  return_reason: string | null;
  return_feedback: string | null;
  return_due_at: string | null;
  /** Stamped the moment staff settle a rental that had a pending return request — i.e. approve it. */
  return_approved_at: string | null;
  return_approved_by: { id: string; full_name: string } | null;
  days_late: number | null;
  late_penalty_amount: number | null;
  late_fee_per_day: number | null;
}

// ---------------------------------------------------------------------------
// Shared pagination shape used across the web app's tables/hooks.
// (Adapted from the backend's { data, pagination } envelope — see
// services/api/httpClient.ts#toPaginatedResult.)
// ---------------------------------------------------------------------------

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// DPDPA — consent (mirrors apps/backend/src/modules/consent/consent.types.ts)
// ---------------------------------------------------------------------------

export type ConsentPurpose =
  | "kyc_identity_verification"
  | "service_delivery"
  | "payments_and_billing"
  | "safety_and_incident"
  | "service_communications"
  | "marketing_communications"
  | "referral_program"
  | "location_services";

export type ConsentAction = "granted" | "withdrawn";

/** Human labels for the console. The rider-facing wording lives in the app's i18n module. */
export const CONSENT_PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  kyc_identity_verification: "Identity verification",
  service_delivery: "Service delivery",
  payments_and_billing: "Payments & billing",
  safety_and_incident: "Safety & incidents",
  service_communications: "Service messages",
  marketing_communications: "Marketing",
  referral_program: "Referrals",
  location_services: "Location",
};

export interface ConsentStateItem {
  purpose: ConsentPurpose;
  required: boolean;
  granted: boolean;
  decided_at: string | null;
  notice_version: string | null;
}

export interface ConsentHistoryItem {
  id: string;
  purpose: ConsentPurpose;
  action: ConsentAction;
  notice_version: string;
  language: "en" | "ta";
  source: "mobile" | "web" | "admin" | "import";
  /** Set only when a staff member recorded the decision on the rider's behalf. */
  recorded_by: { id: string; full_name: string } | null;
  created_at: string;
}

export interface UserConsentRecord {
  current_notice_version: string;
  up_to_date: boolean;
  items: ConsentStateItem[];
  history: ConsentHistoryItem[];
}

// ---------------------------------------------------------------------------
// DPDPA — PII access log (mirrors apps/backend/src/common/piiAccess.ts)
// ---------------------------------------------------------------------------

export type PiiAccessReason =
  | "kyc_review"
  | "support_ticket"
  | "fraud_investigation"
  | "rights_request"
  | "legal_request"
  | "rider_self"
  | "other";

/**
 * Reasons a staff member can pick when opening a rider's documents.
 *
 * "rider_self" is absent on purpose — it is set by the server for a rider
 * reading their own record, and is not something staff can claim.
 */
export const PII_ACCESS_REASON_LABELS: Record<Exclude<PiiAccessReason, "rider_self">, string> = {
  kyc_review: "Reviewing this rider's KYC",
  support_ticket: "Working a support ticket",
  fraud_investigation: "Fraud or misuse investigation",
  rights_request: "Actioning a data-rights request",
  legal_request: "Legal or police request",
  other: "Something else",
};

export interface PiiAccessEntry {
  id: string;
  resource: string;
  resource_id: string | null;
  fields: string[] | null;
  reason: PiiAccessReason;
  context_ref: string | null;
  actor_roles: string[];
  ip: string | null;
  path: string | null;
  created_at: string;
  actor: { id: string; full_name: string } | null;
  target_user: { id: string; full_name: string } | null;
}

// ---------------------------------------------------------------------------
// DPDPA — data-principal rights
// (mirrors apps/backend/src/modules/privacy/privacy.types.ts)
// ---------------------------------------------------------------------------

export type DpRequestType =
  | "access_export"
  | "correction"
  | "erasure"
  | "grievance"
  | "nominee_update";

export type DpRequestStatus =
  | "open"
  | "in_progress"
  | "awaiting_principal"
  | "completed"
  | "rejected"
  | "withdrawn";

export const DP_REQUEST_TYPE_LABELS: Record<DpRequestType, string> = {
  access_export: "Copy of data",
  correction: "Correction",
  erasure: "Erasure",
  grievance: "Grievance",
  nominee_update: "Nominee",
};

export const DP_REQUEST_STATUS_LABELS: Record<DpRequestStatus, string> = {
  open: "Received",
  in_progress: "In progress",
  awaiting_principal: "Waiting on rider",
  completed: "Completed",
  rejected: "Rejected",
  withdrawn: "Withdrawn by rider",
};

export interface PrivacyRequest {
  id: string;
  /** Human-readable, e.g. "DPR-2026-000042" — what the rider quotes. */
  reference: string;
  type: DpRequestType;
  status: DpRequestStatus;
  channel: "app" | "email" | "phone" | "walk_in";
  details: string | null;
  requested_changes: Record<string, string> | null;
  sla_due_at: string;
  /** Erasure only: nothing is destroyed before this. */
  grace_ends_at: string | null;
  resolution_notes: string | null;
  rejection_reason: string | null;
  ticket_ref: string | null;
  export_object_path: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
  rider: { id: string; full_name: string; phone: string | null; email: string | null } | null;
  assigned_to: { id: string; full_name: string } | null;
  /** Past the published response period and not yet closed. */
  is_overdue: boolean;
}
