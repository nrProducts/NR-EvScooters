// ---------------------------------------------------------------------------
// Auth / roles
// ---------------------------------------------------------------------------

/**
 * The role vocabulary, which is now three values on one column.
 *
 * `users.role` replaced the `roles`/`user_roles` join, and `technician` and
 * `station_manager` did not survive the move — they were role names with no
 * distinct grants behind them, and what they were reaching for is expressed
 * by giving an account the operations permissions instead.
 */
export type BackendRoleName = "rider" | "staff" | "admin";

/** What the web console's nav/route-guarding cares about. */
export type Role = "admin" | "staff";

/**
 * A module key, e.g. `"vehicles"`. Deliberately a bare string.
 *
 * There used to be a hand-written union here, with `MODULE_KEYS`,
 * `MODULE_LABELS` and `MODULE_ACTIONS` beside it — three tables of data
 * mirroring `public.modules` and `public.permissions`, maintained by hand in
 * two repositories, and silently wrong the moment a migration added a
 * permission. They are gone. The catalogue is fetched from
 * `GET /permissions/catalog` (see services/api/permissions.ts) and rendered
 * from whatever the server says exists.
 *
 * The compile-time safety that union provided is genuinely lost. It was
 * buying very little: a typo in a module key produced a matrix checkbox that
 * granted nothing, which the backend rejected anyway, and the union could not
 * catch the far more common error of the two lists having drifted apart.
 */
export type ModuleKey = string;

/** A `permissions.action` value, unique only within its module. */
export type PermissionAction = string;

/** `"<module>.<action>"` — how a permission is written in grants and logs. */
export type PermissionKey = string;

export const permissionKey = (moduleKey: ModuleKey, action: PermissionAction): PermissionKey =>
  `${moduleKey}.${action}`;

/** A row of `public.modules`, as `GET /permissions/catalog` returns it. */
export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** A row of `public.permissions`. */
export interface PermissionDef {
  id: string;
  moduleKey: ModuleKey;
  action: PermissionAction;
  label: string;
  description: string | null;
  /**
   * False when no route enforces this permission yet. The matrix renders it
   * disabled — the successor to the old `available` flag, except a migration
   * moves it now rather than a code edit in two repositories.
   */
  isEnforced: boolean;
}

/**
 * A row of `public.permission_profiles` — the replacement for the deleted
 * `config/permissionProfiles.ts`.
 */
export interface PermissionProfileDef {
  code: string;
  label: string;
  description: string;
  sortOrder: number;
  /** System profiles ship with the schema and cannot be deleted. */
  isSystem: boolean;
  permissions: PermissionKey[];
}

/** Everything the permission matrix needs, in one response. */
export interface PermissionCatalog {
  modules: ModuleDef[];
  permissions: PermissionDef[];
  profiles: PermissionProfileDef[];
}

/**
 * A profile's `code`. Was a closed union of five literals; it is a database
 * row now, so the console cannot know the set at compile time.
 *
 * `"custom"` is still not a profile. It is what the UI shows once an admin
 * has diverged from a named one, and no row will ever carry that code.
 */
export type PermissionProfileName = string;
export const CUSTOM_PROFILE = "custom";

/** A single module's granted verbs, as the console reads and writes them. */
export interface ModulePermission {
  module_key: ModuleKey;
  actions: string[];
}

/**
 * Capabilities are gone.
 *
 * `kyc_reviewer`, `rights_officer` and `pii_exporter` were a second
 * authorisation axis running alongside modules: which sections you may open,
 * versus whether you may see raw personal data inside them. The new schema
 * collapses them into ordinary permissions — `kyc.reveal_number`,
 * `privacy.process`, `privacy.export` — so they sit in the same matrix as
 * everything else and are granted the same way.
 *
 * `SessionUser.permissionKeys` is where they went. Anything that used to ask
 * "does this user hold the kyc_reviewer capability?" now asks whether
 * `permissionKeys` contains `"kyc.reveal_number"`.
 */

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** `users.role`, unnarrowed. Was `roles: BackendRoleName[]`. */
  backendRole: BackendRoleName;
  /** null = unrestricted (admin). Array = exact granted module+action pairs (staff). */
  permissions: ModulePermission[] | null;
  /**
   * The same grants flattened to `"<module>.<action>"`, which is what a
   * "may they see this control?" check wants. Empty for admin, whose access
   * is unconditional and therefore not enumerated.
   */
  permissionKeys: PermissionKey[];
  avatarUrl?: string;
  phone?: string;
  /** True for a staff account still on its admin-issued temporary password — ProtectedRoute locks every other page until they set their own. */
  mustChangePassword: boolean;
}

/** Does this console user hold `<module>.<action>`? Admin always does. */
export const hasPermission = (
  user: Pick<StaffUser, "role" | "permissionKeys">,
  moduleKey: ModuleKey,
  action: PermissionAction,
): boolean =>
  user.role === "admin" || user.permissionKeys.includes(permissionKey(moduleKey, action));

/** Any permission at all in the module — "may they open this section?". */
export const hasModuleAccess = (
  user: Pick<StaffUser, "role" | "permissionKeys">,
  moduleKey: ModuleKey,
): boolean =>
  user.role === "admin" || user.permissionKeys.some((k) => k.startsWith(`${moduleKey}.`));

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
  /** One value now — `users.role`. Was an array off `user_roles`. */
  role: BackendRoleName;
  assigned_vehicle: { id: string; vin: string; model: string; name: string; registration_number: string } | null;
  current_plan: { id: string; name: string; price: number; billing_cycle: string } | null;
  /**
   * The booking's own status before pickup (pending_payment/confirmed), or
   * the SUBSCRIPTION's afterwards (active/past_due/paused). Null when the
   * rider has no live booking or subscription.
   *
   * `due` is `past_due`: the same state, read off `subscriptions.status`
   * rather than the departed `bookings.plan_status`.
   */
  payment_status: "pending_payment" | "confirmed" | "active" | "past_due" | "paused" | null;
  /** `subscriptions.started_on`. Null before pickup or with no subscription. */
  plan_started_at: string | null;
  /** The current period's `due_on`. <= today means due today or overdue. */
  next_due_at: string | null;
}

export interface AppUserDocument {
  id: string;
  doc_type: string;
  /** See KycDocumentDetail.doc_number_masked — masked is the only form. */
  doc_number_masked: string | null;
  verification_status: string;
  rejection_reason: string | null;
  expires_on: string | null;
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
  expires_on: string | null;
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
  vehicle: { id: string; name: string; registration_number: string; status: VehicleStatus } | null;
  /** Recurring-billing state — set once the booking reaches 'fulfilled', null before and after (see BookingStatus). */
  plan_status: BookingPlanStatus | null;
  next_due_at: string | null;
  /** 'scheduled' once an on-time/early renewal has been paid but not yet activated. */
  renewal_status: "none" | "scheduled";
  scheduled_start_date: string | null;
  /** Admin-set per-booking override for the late renewal fee — wins over the global plan_renewal_settings amount. */
  late_fee_override: number | null;
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
/**
 * `public.vehicle_status`. Two renames: `booked` is `reserved`, and `scrap` is
 * `retired` — the name it had before the old project renamed it.
 *
 * Read-only. `recompute_vehicle_status()` derives it from the vehicle's open
 * maintenance ticket, rental assignment and booking hold; nothing writes it.
 */
export type VehicleStatus =
  "available" | "reserved" | "assigned" | "maintenance" | "retired";

/**
 * A vehicle, as GET /vehicles returns it.
 *
 * Eight fields left with the schema, and each for a reason worth knowing:
 *
 *   battery_number, battery_percentage  A battery was modelled as a permanent
 *                                       property of a scooter, enforced by a
 *                                       UNIQUE column. Batteries are swapped
 *                                       at stations; that was never true.
 *   manufacturer                        A property of the MODEL, duplicated
 *                                       onto every unit of it.
 *   insurance_number, insurance_expiry  Now `vehicle_documents` rows, where
 *                                       registration and PUC already lived.
 *   last_service_date,                  Derived from `maintenance_tickets`
 *   next_service_due_date               rather than stored and re-stored.
 *   active                              Redundant with `status = 'retired'`,
 *                                       and able to disagree with it.
 */
export interface Vehicle {
  id: string;
  /** `display_name`, falling back to the model name. */
  name: string;
  registration_number: string;
  /** `vehicle_models.name`, via the model FK. Was a text column on the vehicle. */
  model: string;
  vehicle_model_id: string;
  vin: string;
  /** Read-only. `recompute_vehicle_status()` owns it; a write would be overwritten. */
  status: VehicleStatus;
  color: string | null;
  qr_code: string | null;
  imei: string | null;
  purchase_date: string | null;
  /** Which hub the vehicle belongs to. New; there was no such column. */
  hub_id: string | null;
  created_at: string;
  updated_at: string | null;
  /**
   * Billing state of whoever currently holds this vehicle —
   * 'pending_payment'/'confirmed' before pickup, then the SUBSCRIPTION's
   * 'active'/'past_due'/'paused'. null when nothing live holds it.
   */
  payment_status: "pending_payment" | "confirmed" | "active" | "past_due" | "paused" | null;
}

export interface VehicleDocument {
  id: string;
  /** Five types now, not two — insurance joined the documents it belonged with. */
  doc_type: "registration" | "insurance" | "puc" | "fitness" | "permit";
  doc_number: string;
  issued_date: string | null;
  expires_on: string;
}

export interface VehicleMaintenanceRecord {
  id: string;
  /** `maintenance_status` gained a `triaged` state. */
  status: "reported" | "triaged" | "in_progress" | "resolved" | "cancelled";
  description: string;
  resolved_at: string | null;
  created_at: string;
  /** `standard_temp` is `temp_vehicle`, and `replacement` is new. */
  outcome: "quick_fix" | "temp_vehicle" | "replacement" | "not_repairable" | null;
  expected_ready_at: string | null;
  /**
   * The vehicle handed to the rider while this one was repaired.
   *
   * From `rental_vehicle_assignments`, not a `temp_vehicle_id` column — a
   * rental can pass through several scooters, so which one stood in is a row
   * with dates rather than a pointer that the next swap overwrites.
   */
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
  /** `subscriptions.status` for the subscription this booking became, if any. */
  plan_status: "active" | "past_due" | "paused" | null;
  start_day: string;
  created_at: string;
  rider: { id: string; full_name: string } | null;
}

/** A row of `vehicle_disposals`. Was `scrap_records`, and has no id of its own. */
export interface ScrapRecord {
  reason: string;
  scrapped_on: string;
  estimated_value: number | null;
  approved_by: { id: string; full_name: string } | null;
  created_at: string;
}

export interface VehicleDetail extends Vehicle {
  documents: VehicleDocument[];
  maintenance_history: VehicleMaintenanceRecord[];
  rental_history: VehicleRentalRecord[];
  booking_history: VehicleBookingRecord[];
  current_rider: { id: string; full_name: string } | null;
  scrap_record: ScrapRecord | null;
}

// ---------------------------------------------------------------------------
// Maintenance (admin) — mirrors apps/backend/src/modules/maintenance/maintenance.types.ts
// ---------------------------------------------------------------------------

export type MaintenanceStatus =
  "reported" | "triaged" | "in_progress" | "resolved" | "cancelled";

/**
 * Set once staff verify a displaced vehicle. Null until triaged.
 *
 * `standard_temp` is `temp_vehicle`; `replacement` is new — a permanent swap
 * used to be indistinguishable from a loan of a spare.
 */
export type MaintenanceOutcome =
  "quick_fix" | "temp_vehicle" | "replacement" | "not_repairable";

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
// Notification Manager — mirrors apps/backend/src/modules/notification-settings
// and notifications/notify.service.ts's NotifyContext.
// ---------------------------------------------------------------------------

/**
 * A `notification_types.code`. A bare string, for the same reason `ModuleKey`
 * is: the seven-value union here — plus its label map, plus the
 * `NOTIFICATION_TYPES` array, plus `RealtimeProvider`'s `APPROVAL_TEMPLATES`
 * — were four hand-written mirrors of table rows, and every notification the
 * backend gained had to be added to all of them or it went missing from this
 * screen with nothing failing.
 *
 * The label, whether it needs action, and where acting on it goes all arrive
 * on the setting row itself now.
 */
export type NotificationType = string;

export interface NotificationRecipient {
  user_id: string;
  full_name: string;
}

export interface NotificationSetting {
  /** The type's `code` — there is no surrogate key on `notification_types`. */
  id: string;
  notification_type: NotificationType;
  /** Human-readable name, from the catalogue rather than the front end. */
  label: string;
  enabled: boolean;
  send_email: boolean;
  send_in_app: boolean;
  /**
   * Whether this notification is a TASK rather than news.
   *
   * The console decided this with a hard-coded `APPROVAL_TEMPLATES` map,
   * which meant an approval-shaped notification needed a front-end change to
   * be treated as one. It is catalogue data now.
   */
  requires_action: boolean;
  /** Where acting on it takes you, e.g. `/kyc`. Null when it is just news. */
  action_path: string | null;
  recipients: NotificationRecipient[];
  updated_at: string | null;
}

/**
 * The catalogue without subscriber lists — GET /notification-settings/types.
 *
 * What a staff session is allowed to know about the notification it just
 * received: its name, whether it is a task, and where acting on it goes.
 * Deliberately not `Pick<NotificationSetting, …>`: this is a separate wire
 * contract from a separate endpoint, and collapsing the two would make it
 * look like the admin payload with fields dropped.
 */
export interface NotificationTypeSummary {
  notification_type: NotificationType;
  label: string;
  requires_action: boolean;
  action_path: string | null;
}

/** A row in the personal (rider/staff/admin) notification inbox — GET /users/me/notifications. */
export interface MyNotification {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  template: string;
  payload: { title: string; body: string; screen?: string } | null;
  status: NotificationDeliveryStatus;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  notification_type: NotificationType | null;
  reference_type: string | null;
  reference_id: string | null;
  booking_id: string | null;
  vehicle_id: string | null;
  rider_id: string | null;
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
  item_type: "plan_fee" | "adjustment" | "deposit";
  /** The charge or discount this line materialises. Was `rider_charge_id`. */
  subscription_adjustment_id: string | null;
  /** Was `label`. */
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  created_at: string;
}

/**
 * Paid-ness, DERIVED by the backend from the money actually allocated. There
 * is no `payment_status` column — that flag is gone precisely because it could
 * disagree with the payments. See apps/backend/.../invoices.types.ts.
 */
export type InvoicePaymentState = "paid" | "partial" | "overdue" | "unpaid";

/** Why the invoice exists. Was the free-er `payment_type`. */
export type InvoicePurpose = "initial" | "subscription_period" | "settlement" | "adhoc";

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string;
  subscription_period_id: string | null;
  rental_id: string | null;
  /** Gap-free, allocated by the database. Not previously exposed. */
  invoice_number: string;
  purpose: InvoicePurpose;
  status: InvoiceStatus;
  issued_on: string | null;
  /** Was `due_date`. A date — an IST calendar day. */
  due_on: string | null;
  subtotal_amount: number;
  /** Was `amount_due`. */
  total_amount: number;
  currency: string;
  created_at: string;
  updated_at: string | null;

  allocated_amount: number;
  balance_amount: number;
  /** Was `payment_status`. Derived, not stored. */
  payment_state: InvoicePaymentState;
  paid_at: string | null;
  payment_method: PaymentMethod | null;
  gateway_ref: string | null;

  rider: { id: string; full_name: string; email: string | null } | null;
  items: InvoiceItem[];
}

export interface InvoiceDetail extends Invoice {
  plan: { id: string; name: string } | null;
  /** `vehicles.name` was never a column — the new one is `display_name`. */
  vehicle: { id: string; display_name: string | null; registration_number: string } | null;
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

/**
 * Four values, not five. `partially_refunded` and `refunded` collapsed into
 * `released` — how much came back is the refund's business, and a deposit
 * that was partly returned is still, from the deposit's point of view,
 * released. The old pair made the deposit row duplicate an amount the refund
 * already knew, and the two could disagree.
 */
export type DepositStatus = "pending" | "held" | "released" | "forfeited";

export interface Deposit {
  id: string;
  /**
   * The agreement this deposit secures. Was `booking_id` — a deposit is taken
   * when the subscription is created and survives every renewal, so pinning
   * it to the reservation attached it to the wrong thing.
   */
  subscription_id: string;
  amount: number;
  status: DepositStatus;
  held_at: string | null;
  /** `refund_eligible_on` — a DATE now, not a timestamp. */
  refund_eligible_at: string | null;
  /** `released_at`. */
  refunded_at: string | null;
  forfeited_at: string | null;
  forfeit_reason: string | null;
  /**
   * How much of `amount` is actually refundable, after undisputed damage.
   * Computed, never stored.
   */
  refundable_amount: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Damages (admin + rider) — mirrors apps/backend/src/modules/damages/damages.types.ts
// ---------------------------------------------------------------------------

/**
 * One table became three: `incidents` (what happened, with the photos),
 * `damages` (what it costs) and `damage_disputes` (the objection).
 *
 * `recorded` is `assessed`; `settled` and `waived` are new terminal states
 * the old three could not express — a scratch written off had nowhere to go.
 */
export type DamageStatus = "assessed" | "disputed" | "settled" | "waived";

export interface Damage {
  id: string;
  /** Resolved through the incident's rental → subscription → booking. */
  booking_id: string | null;
  rental_id: string | null;
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

/** `succeeded`, matching `payment_status` — `success` was the odd one out. */
export type RefundStatus = "pending" | "processing" | "succeeded" | "failed";

/**
 * `refund_reason`. Was `refund_type` with three values; there are four now,
 * and they say WHY rather than what kind:
 *
 *   deposit_release      the post-return deposit release (was `deposit`)
 *   booking_cancellation unchanged
 *   settlement           a return settlement paying money back
 *   goodwill             a discretionary refund, which had no expression at all
 */
export type RefundType =
  "deposit_release" | "booking_cancellation" | "settlement" | "goodwill";

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
// Return & Settlement (admin) — mirrors apps/backend/src/modules/returns/returns.types.ts
// ---------------------------------------------------------------------------

export type ReturnSettlementStatus =
  | "pending_refund" | "refund_processing" | "refund_completed"
  | "no_refund_required" | "amount_due" | "settlement_completed";

export interface OtherCharge {
  label: string;
  amount: number;
}

export interface ReturnSettlement {
  id: string;
  rental_id: string;
  booking_id: string;
  user_id: string;
  vehicle_id: string;
  deposit_amount: number;
  late_fee_amount: number;
  damage_fee_amount: number;
  other_charges: OtherCharge[];
  other_charges_amount: number;
  total_charges: number;
  net_settlement: number;
  refund_amount: number;
  due_amount: number;
  status: ReturnSettlementStatus;
  refund_id: string | null;
  due_invoice_id: string | null;
  processed_by: { id: string; full_name: string } | null;
  created_at: string;
  processed_at: string | null;
}

export interface ReturnDetail {
  rental: AdminRental;
  deposit: Deposit | null;
  damages: Damage[];
  latePreview: { daysLate: number; penaltyAmount: number; feePerDay: number };
  settlement: ReturnSettlement | null;
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
  /**
   * The actor's role at the time of access — ONE value now
   * (`actor_role_snapshot`). Was `actor_roles: string[]`, off the deleted
   * `user_roles` table.
   */
  actor_role: Role;
  /** Was `ip`. */
  ip_address: string | null;
  /** Was `path`. */
  request_path: string | null;
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
  /**
   * `ticket_ref` is gone — the new `data_principal_requests` has no such
   * column. A privacy request IS the ticket; the field was a pointer to a
   * support ticket that duplicated it.
   */
  export_storage_path: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string | null;
  rider: { id: string; full_name: string; phone: string | null; email: string | null } | null;
  assigned_to: { id: string; full_name: string } | null;
  /** Past the published response period and not yet closed. */
  is_overdue: boolean;
}
