import type { Database } from "./database.types";

type Enums = Database["public"]["Enums"];

/**
 * ============================================================================
 * ROLE
 * ============================================================================
 *
 * One column, three values. The old schema had a `roles` table, a `user_roles`
 * join and five role names; the new one has `users.role`, and the JWT carries
 * it as the `user_role` claim (see `public.custom_access_token_hook`).
 *
 * `technician` and `station_manager` are gone as roles. They were never
 * anything but named bundles of permissions, which is what
 * `permission_profiles` now is — see the `operations_staff` profile.
 */
export type UserRole = Enums["user_role"];
export const USER_ROLES: readonly UserRole[] = ["rider", "staff", "admin"] as const;

/** Roles that can reach the admin console at all. Mirrors `is_staff()` in SQL. */
export const STAFF_ROLES: readonly UserRole[] = ["staff", "admin"] as const;

export const isStaffRole = (role: UserRole): boolean =>
    role === "staff" || role === "admin";

/**
 * ============================================================================
 * PERMISSIONS — ONE LAYER NOW, NOT TWO
 * ============================================================================
 *
 * The old model had modules ("which part of the console may this person
 * OPEN?") and, orthogonal to them, capabilities ("may this person see RAW
 * PERSONAL DATA?") — `kyc_reviewer`, `rights_officer`, `pii_exporter` living
 * in their own table with their own middleware.
 *
 * The new schema collapses that into `modules` x `permissions`, because the
 * distinction was one of naming rather than mechanism: a capability was
 * always just a permission that happened not to have a module. The three
 * capabilities map onto ordinary permissions:
 *
 *   kyc_reviewer   -> kyc.reveal_number
 *   rights_officer -> privacy.process
 *   pii_exporter   -> privacy.export
 *
 * The DPDPA least-privilege property that motivated the split survives intact:
 * `kyc.view` still lets an agent work the queue without `kyc.reveal_number`
 * ever letting them read an Aadhaar number. It is now expressed with one
 * mechanism instead of two.
 *
 * Crucially, **the catalogue is data, not code**. `MODULE_KEYS` and
 * `MODULE_ACTIONS` used to be hard-coded here and hand-mirrored into the web
 * app; adding a permission meant editing three files and a migration. The
 * `modules` and `permissions` tables are now the only source of truth, read at
 * runtime — which is why the types below are structural rather than unions of
 * literals. A permission that does not exist in the database is not a type
 * error, it is a lookup that returns nothing, and that is the right failure:
 * the code cannot drift from the grant table.
 */

/** A `modules.key` value. Free-form by design — see the note above. */
export type ModuleKey = string;

/** A `permissions.action` value, unique only within its module. */
export type PermissionAction = string;

/** `"<module_key>.<action>"` — how a permission is written in logs and grants. */
export type PermissionKey = `${string}.${string}`;

export const permissionKey = (
    moduleKey: ModuleKey,
    action: PermissionAction,
): PermissionKey => `${moduleKey}.${action}`;

/** A row of `public.modules`, as the console's permission matrix consumes it. */
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
     * False when no route actually checks this permission yet. The console
     * renders it disabled — the replacement for the old `available` flag,
     * except a migration now moves it rather than a code edit.
     */
    isEnforced: boolean;
}

/**
 * A row of `public.permission_profiles` — the replacement for the deleted
 * `config/permissionProfiles.ts` in both the backend and the web app.
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

/**
 * ============================================================================
 * STATUS AND DOCUMENT ENUMS
 * ============================================================================
 * Sourced from the generated database types rather than restated, so a
 * migration that adds a value breaks the compiler here instead of failing
 * silently at the insert.
 */

/** Was `AccountStatus`; the column is `users.status`, the enum `user_status`. */
export type UserStatus = Enums["user_status"];
export const USER_STATUSES: readonly UserStatus[] = [
    "active", "inactive", "suspended",
] as const;

export type KycStatus = Enums["kyc_status"];
export const KYC_STATUSES: readonly KycStatus[] = [
    "not_submitted", "pending", "partially_verified", "verified", "rejected",
] as const;

/** Note the spelling: the new enum is `driving_licence`, not `driving_license`. */
export type KycDocType = Enums["kyc_document_type"];
export const KYC_DOC_TYPES: readonly KycDocType[] = [
    "aadhaar", "driving_licence", "passport", "voter_id", "address_proof",
] as const;

/**
 * Types a rider must have verified before overall KYC can reach `verified`.
 * Duplicated from `public.mandatory_kyc_doc_types()`, which is what
 * `compute_kyc_status()` actually uses — keep the two in step.
 */
export const MANDATORY_KYC_DOC_TYPES: readonly KycDocType[] = [
    "aadhaar", "driving_licence",
] as const;

export type VerificationStatus = Enums["verification_status"];

export type NotificationChannel = Enums["notification_channel"];
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
    "push", "email", "sms",
] as const;

/**
 * Per-channel outcome. The old single `notifications_log.status` is now
 * `notification_deliveries.status`, one row per channel attempted.
 */
export type DeliveryStatus = Enums["delivery_status"];
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
    "pending", "sent", "failed",
] as const;

/**
 * Notification categories are no longer an enum — `notification_types` is a
 * table, so a new one needs no deploy. This is its `code` column, and it stays
 * `string` on purpose: the set of codes that may EXIST is data.
 */
export type NotificationTypeCode = string;

/**
 * The codes this application can EMIT.
 *
 * A different question from the one above, and the distinction is what was
 * missing. Which codes may exist is data — a row, no deploy. Which codes this
 * source can produce is finite, hard-coded, and knowable at compile time, so
 * it is a union.
 *
 * `notification_type_code` is `FOREIGN KEY … REFERENCES notification_types(code)
 * ON DELETE RESTRICT` on both `notification_events` and
 * `notification_messages`. Every other table and column reference in this
 * codebase is compile-checked, because `supabaseAdmin` is typed over the
 * generated `Database`. This one was not — it was a bare `string` — and it is
 * exactly where two independent defects hid:
 *
 *   · 20 of the 26 codes emitted did not exist in the database at all, so
 *     `notifyUser` failed its insert on a foreign key and swallowed the error;
 *   · `notify()` was passing seven category names that were not codes in any
 *     sense, and was dropping every staff notification before it inserted.
 *
 * Neither was a type error. Both are now: adding a code here without seeding
 * it fails `notificationCodes.test.ts`, which reads the seed migrations and
 * checks this union against them.
 *
 * See docs/final-system-audit (findings C5, C6, L3).
 */
export type EmittedNotificationCode =
    // Bookings and the payment that confirms them.
    | "booking_created"
    | "booking_cancelled"
    | "booking_expired"
    | "payment_success"
    | "payment_failed"
    | "payment_overdue"
    // Subscription lifecycle.
    | "plan_renewed"
    | "plan_resumed"
    // Pickup, rental, return.
    | "pickup_confirmed"
    | "vehicle_assigned"
    | "vehicle_available_again"
    | "rental_completed"
    | "rental_return_requested"
    | "rental_return_rejected"
    | "return_payment_required"
    | "vehicle_recovery_required"
    // KYC.
    | "kyc_review_needed"
    | "kyc_approved"
    | "kyc_rejected"
    // Maintenance.
    | "maintenance_review_needed"
    | "maintenance_ticket_created"
    | "maintenance_plan_paused"
    | "maintenance_quick_fix"
    | "maintenance_temp_vehicle"
    | "maintenance_vehicle_returned"
    // Damages.
    | "damage_added"
    | "damage_dispute_resolved"
    // Refunds.
    | "refund_needs_approval"
    | "refund_initiated"
    | "refund_completed"
    | "refund_rejected"
    | "adhoc_charge_added"
    // Support and broadcasts.
    | "support_ticket_created"
    | "support_status_updated"
    | "admin_broadcast";

/** Every member of the union above, for the seed-coverage test to iterate. */
export const EMITTED_NOTIFICATION_CODES: readonly EmittedNotificationCode[] = [
    "booking_created", "booking_cancelled", "booking_expired",
    "payment_success", "payment_failed", "payment_overdue",
    "plan_renewed", "plan_resumed",
    "pickup_confirmed", "vehicle_assigned", "vehicle_available_again",
    "rental_completed", "rental_return_requested", "rental_return_rejected", "return_payment_required",
    "vehicle_recovery_required",
    "kyc_review_needed", "kyc_approved", "kyc_rejected",
    "maintenance_review_needed", "maintenance_ticket_created",
    "maintenance_plan_paused", "maintenance_quick_fix",
    "maintenance_temp_vehicle", "maintenance_vehicle_returned",
    "damage_added", "damage_dispute_resolved",
    "refund_needs_approval", "refund_initiated", "refund_completed", "refund_rejected",
    "adhoc_charge_added",
    "support_ticket_created", "support_status_updated", "admin_broadcast",
] as const;

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * What `auth.middleware` resolves for the current request.
 *
 * `permissions` is the flattened `v_user_effective_permissions` result — role
 * grants and per-user overrides already reconciled by the view, admins already
 * expanded to everything. Consumers check membership; they never re-derive it
 * from the role.
 */
export interface AuthContext {
    id: string;
    email?: string;
    role: UserRole;
    /** `"<module>.<action>"` keys. Empty for riders. */
    permissions: ReadonlySet<PermissionKey>;
    status: UserStatus;
    kycStatus: KycStatus;
    isDeleted: boolean;
}

/** Does this request hold `<moduleKey>.<action>`? */
export const hasPermission = (
    auth: Pick<AuthContext, "permissions">,
    moduleKey: ModuleKey,
    action: PermissionAction,
): boolean => auth.permissions.has(permissionKey(moduleKey, action));

/**
 * Does this request hold *any* permission in the module? The coarse
 * "may they open this section at all" gate the old `requireModule` provided.
 */
export const hasModuleAccess = (
    auth: Pick<AuthContext, "permissions">,
    moduleKey: ModuleKey,
): boolean => {
    const prefix = `${moduleKey}.`;
    for (const key of auth.permissions) if (key.startsWith(prefix)) return true;
    return false;
};
