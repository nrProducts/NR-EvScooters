export type RoleName = "rider" | "staff" | "technician" | "station_manager" | "admin";
export const ROLE_NAMES: readonly RoleName[] = [
    "rider", "staff", "technician", "station_manager", "admin",
] as const;

export const STAFF_ROLES: readonly RoleName[] = ["staff", "technician", "station_manager", "admin"] as const;

/**
 * ============================================================================
 * TWO LAYERS OF STAFF AUTHORISATION. They are not alternatives.
 * ============================================================================
 *
 * ModuleKey answers "which part of the console may this person OPEN?"
 * StaffCapability answers "may this person see RAW PERSONAL DATA?"
 *
 * They compose, coarse gate then fine gate. Reaching the KYC queue needs the
 * `kyc` module; opening the Aadhaar image inside it additionally needs the
 * `kyc_reviewer` capability. An ops agent can therefore work the queue —
 * chasing riders for missing documents — without ever being able to look at
 * an identity document, which is the whole point of the DPDPA least-privilege
 * work and is not expressible with modules alone.
 *
 * Keep them separate. Folding capabilities into MODULE_KEYS would make
 * "can open the KYC section" and "can view someone's Aadhaar" the same
 * permission, which is the state this replaced.
 */

/**
 * Modules a staff account can be individually granted access to (see
 * public.staff_permissions / requireModule() in authorize.middleware.ts).
 * Admin bypasses this entirely — always unconditional access. Mirrored in
 * apps/web/src/types/index.ts — keep both lists in sync by hand (no shared
 * package exists in this monorepo).
 */
export type ModuleKey =
    | "vehicles" | "users" | "kyc" | "bookings" | "maintenance" | "support"
    | "payments" | "notifications" | "damages" | "refunds"
    // The data-principal rights queue. No migration needed to add a module —
    // staff_permissions.module_key is deliberately free text (see
    // 20260813100100_staff_role_seed_and_permissions_table.sql).
    | "privacy"
    // Added by 20260814101000_staff_permission_actions.sql alongside the
    // `actions` column — these were previously hard admin-only in
    // roleConfig.ts with no delegation path at all.
    | "plans" | "reconciliation" | "pii_access_log" | "audit" | "settings"
    | "dashboard" | "battery_stations"
    // Configurable Billing & Charges engine (charge rules, materialized
    // rider charges, waivers) — see 20260817100000_billing_charge_engine.sql.
    | "billing"
    // Return review + settlement — see 20260820100000_return_settlements.sql.
    | "returns";
export const MODULE_KEYS: readonly ModuleKey[] = [
    "vehicles", "users", "kyc", "bookings", "maintenance", "support",
    "payments", "notifications", "damages", "refunds", "privacy",
    "plans", "reconciliation", "pii_access_log", "audit", "settings",
    "dashboard", "battery_stations", "billing", "returns",
] as const;

export interface ModuleActionDef {
    /** Stored verbatim in staff_permissions.actions[]. */
    key: string;
    /** Console label — where one backend check covers several spec verbs
     * (e.g. KYC's requireAction("kyc","review") gates verify/approve/reject
     * alike, because the capability layer — not the module-action layer —
     * is what actually distinguishes "see the queue" from "act on it"), the
     * label says so rather than offering separate checkboxes that would
     * silently move together. */
    label: string;
    /** False = no backend route (or, for "settings"/"view_kyc", no UI wired
     * yet) checks this action at all. The console renders it disabled —
     * matches the full permission spec visually without implying a
     * capability that doesn't exist. See requireAction() call sites for
     * what's actually enforced. */
    available: boolean;
}

/**
 * Every module's grantable verbs, in the shape the permission matrix UI
 * renders directly — see the `actions` column added by
 * 20260814101000_staff_permission_actions.sql. Kept here, not per-route,
 * because it's the one place the matrix UI, the profile config, and the
 * update-permissions validator all need to agree on what's grantable.
 */
export const MODULE_ACTIONS: Record<ModuleKey, readonly ModuleActionDef[]> = {
    dashboard: [{ key: "view", label: "View", available: true }],
    vehicles: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: true },
        { key: "edit", label: "Edit", available: true },
        { key: "assign", label: "Assign / Unassign", available: true },
        { key: "maintenance", label: "Maintenance", available: false }, // lives under the Maintenance module's own actions
        { key: "delete", label: "Delete", available: true },
    ],
    users: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: false }, // POST /users stays admin-only regardless — creating any account (rider included) isn't delegable
        { key: "edit", label: "Edit", available: true },
        { key: "suspend", label: "Suspend / Activate", available: true },
        { key: "delete", label: "Delete", available: false }, // DELETE /:id stays admin-only
        { key: "view_kyc", label: "View KYC", available: true }, // UI-only: shows/hides the KYC tab on the user detail page
    ],
    kyc: [
        { key: "view", label: "View", available: true },
        { key: "review", label: "Review / Approve / Reject", available: true },
    ],
    bookings: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: false }, // riders create their own bookings; no staff-facing route
        { key: "edit", label: "Edit", available: true },
        { key: "cancel", label: "Cancel", available: true },
        { key: "assign_vehicle", label: "Assign Vehicle", available: false }, // folded into the pickup route (bookings.edit); no separate endpoint
    ],
    maintenance: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: true },
        { key: "edit", label: "Edit", available: true },
        { key: "complete", label: "Complete", available: true },
        { key: "delete", label: "Delete", available: false }, // no delete route exists
    ],
    support: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: false }, // rider-initiated only
        { key: "reply", label: "Reply / Resolve", available: true }, // single PATCH route can't distinguish reply from resolve server-side
        { key: "resolve", label: "Resolve (see Reply)", available: false },
        { key: "delete", label: "Delete", available: false }, // no delete route
    ],
    payments: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: false }, // riders create their own payment orders
        { key: "refund", label: "Refund", available: true },
        { key: "export", label: "Export", available: false }, // no export endpoint yet
    ],
    plans: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: true },
        { key: "edit", label: "Edit / Activate / Deactivate", available: true },
        { key: "delete", label: "Delete", available: false }, // no delete route exists
    ],
    reconciliation: [
        { key: "view", label: "View", available: true }, // reconciliation is read-only computed data today
        { key: "create", label: "Create", available: false },
        { key: "approve", label: "Approve", available: false },
        { key: "export", label: "Export", available: false },
    ],
    notifications: [
        { key: "view", label: "View", available: true },
        { key: "create", label: "Create", available: false }, // no draft/create route
        { key: "send", label: "Send", available: true },
        { key: "delete", label: "Delete", available: false }, // no delete route
    ],
    privacy: [
        { key: "view", label: "View", available: true },
        { key: "process", label: "Approve / Reject / Process", available: true }, // requireRightsOfficer stays layered on top
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
        { key: "view", label: "View", available: true }, // gates the generic Company/Security/API Keys/Branding tabs only — never Staff Access
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
    returns: [
        { key: "view", label: "View", available: true },
        { key: "approve", label: "Approve Return / Settlement", available: true },
    ],
};

/** Every valid `{module, action}` pair — the update-permissions validator's source of truth. */
export function isValidModuleAction(moduleKey: ModuleKey, action: string): boolean {
    return MODULE_ACTIONS[moduleKey]?.some((a) => a.key === action) ?? false;
}

/**
 * Orthogonal to both role and module. Granted per user in
 * public.user_capabilities, never implied by a role — including admin, which
 * only starts with all three because the migration backfilled existing admins
 * so nobody was locked out on deploy.
 */
export type StaffCapability = "kyc_reviewer" | "rights_officer" | "pii_exporter";
export const STAFF_CAPABILITIES: readonly StaffCapability[] = [
    "kyc_reviewer", "rights_officer", "pii_exporter",
] as const;

export type AccountStatus = "active" | "inactive" | "suspended";
export const ACCOUNT_STATUSES: readonly AccountStatus[] = ["active", "inactive", "suspended"] as const;

export type KycStatus = "not_submitted" | "pending" | "partially_verified" | "verified" | "rejected";
export const KYC_STATUSES: readonly KycStatus[] = [
    "not_submitted", "pending", "partially_verified", "verified", "rejected",
] as const;

export type KycDocType = "aadhaar" | "driving_license" | "passport" | "voter_id" | "address_proof";
export const KYC_DOC_TYPES: readonly KycDocType[] = [
    "aadhaar", "driving_license", "passport", "voter_id", "address_proof",
] as const;

/** Types a rider must have verified before overall KYC can reach 'verified'. */
export const MANDATORY_KYC_DOC_TYPES: readonly KycDocType[] = ["aadhaar", "driving_license"] as const;

export type VerificationStatus = "pending" | "verified" | "rejected";

export type NotificationChannel = "sms" | "push" | "email";
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ["sms", "push", "email"] as const;

export type NotificationStatus = "sent" | "failed" | "pending";
export const NOTIFICATION_STATUSES: readonly NotificationStatus[] = ["sent", "failed", "pending"] as const;

/** The 7 admin/staff-configurable event categories — see notification_settings. */
export type NotificationType =
    "booking" | "kyc" | "return" | "cancellation" | "refund" | "damage" | "maintenance";
export const NOTIFICATION_TYPES: readonly NotificationType[] =
    ["booking", "kyc", "return", "cancellation", "refund", "damage", "maintenance"] as const;

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AuthContext {
    id: string;
    email?: string;
    roles: RoleName[];
    capabilities: StaffCapability[];
    accountStatus: AccountStatus;
    kycStatus: KycStatus;
    isDeleted: boolean;
}
