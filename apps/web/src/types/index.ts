// ---------------------------------------------------------------------------
// Auth / roles
// ---------------------------------------------------------------------------

/** Full role vocabulary the backend's types.ts defines (apps/backend/src/types/index.ts).
 * Only "rider" and "admin" exist in the DB enum today (per the schema dump) —
 * "staff" / "technician" / "station_manager" are coded for but not yet
 * migrated, so accounts holding them won't exist until that migration ships. */
export type BackendRoleName = "rider" | "staff" | "technician" | "station_manager" | "admin";

/** What the web console's nav/route-guarding cares about. */
export type Role = "admin" | "staff";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Every backend role the account actually holds (for future fine-grained UI). */
  roles: BackendRoleName[];
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
  roles: BackendRoleName[];
  assigned_vehicle: { id: string; vin: string; model: string } | null;
  current_plan: { id: string; name: string; status: string } | null;
}

export interface AppUserDocument {
  id: string;
  doc_type: string;
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
  doc_number_masked?: string | null;
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

export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired" | "fulfilled";

export interface PickupBooking {
  id: string;
  status: BookingStatus;
  start_day: string;
  created_at: string;
  vehicle_model: { id: string; name: string } | null;
  station: { id: string; name: string; code: string; lat: number; lng: number } | null;
  plan: { id: string; name: string; billing_cycle: string; price: number } | null;
  rider: { id: string; full_name: string; phone: string | null };
  /** The physical unit already reserved by allocate_vehicle_for_booking(), if any. */
  vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
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
}

export interface VehicleRentalRecord {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
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
  current_rider: { id: string; full_name: string } | null;
  scrap_record: ScrapRecord | null;
}

// ---------------------------------------------------------------------------
// Maintenance (admin) — mirrors apps/backend/src/modules/maintenance/maintenance.types.ts
// ---------------------------------------------------------------------------

export type MaintenanceStatus = "reported" | "in_progress" | "resolved" | "cancelled";

export interface MaintenanceTicket {
  id: string;
  status: MaintenanceStatus;
  description: string;
  resolved_at: string | null;
  created_at: string;
  vehicle: { id: string; name: string; registration_number: string } | null;
  reported_by: { id: string; full_name: string } | null;
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
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type PaymentMethod = "card" | "wallet" | "upi" | "cash";

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string | null;
  rental_id: string | null;
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
}

export interface InvoiceDetail extends Invoice {
  plan: { id: string; name: string } | null;
  vehicle: { id: string; name: string; registration_number: string } | null;
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
