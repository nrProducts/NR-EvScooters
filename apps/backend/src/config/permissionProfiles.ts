import { ModuleKey } from "../types";

/**
 * Predefined starting points an admin can apply, then hand-edit, when
 * granting a staff account's permissions (see staff-permissions.service.ts
 * applyPermissionProfile). "custom" is not a real preset — it's what the
 * console shows once an admin has diverged from a named profile, or built a
 * grant set from scratch — so it has no entry here.
 *
 * Static config, not a DB table: the product spec names exactly these five
 * profiles and doesn't ask for admin-editable profile definitions. Mirrored
 * by hand at apps/web/src/config/permissionProfiles.ts — same convention as
 * MODULE_KEYS/MODULE_ACTIONS (no shared package in this monorepo).
 */
export type PermissionProfileName =
    | "viewer" | "operations_staff" | "support_staff" | "finance_staff" | "kyc_staff" | "custom";

export const PERMISSION_PROFILE_NAMES: readonly Exclude<PermissionProfileName, "custom">[] = [
    "viewer", "operations_staff", "support_staff", "finance_staff", "kyc_staff",
] as const;

export interface PermissionProfile {
    label: string;
    description: string;
    modules: Partial<Record<ModuleKey, readonly string[]>>;
}

export const PERMISSION_PROFILES: Record<Exclude<PermissionProfileName, "custom">, PermissionProfile> = {
    viewer: {
        label: "Viewer",
        description: "Read-only access across the console — no create, edit, or approve actions anywhere.",
        modules: {
            dashboard: ["view"],
            vehicles: ["view"],
            users: ["view"],
            kyc: ["view"],
            bookings: ["view"],
            maintenance: ["view"],
            support: ["view"],
            payments: ["view"],
            plans: ["view"],
            notifications: ["view"],
            privacy: ["view"],
        },
    },
    operations_staff: {
        label: "Operations Staff",
        description: "Runs the fleet day-to-day: vehicles, bookings, maintenance, battery stations.",
        modules: {
            dashboard: ["view"],
            vehicles: ["view", "create", "edit", "assign"],
            bookings: ["view", "edit", "cancel"],
            maintenance: ["view", "create", "edit", "complete"],
            battery_stations: ["view", "edit"],
            users: ["view"],
        },
    },
    support_staff: {
        label: "Support Staff",
        description: "Handles rider support tickets and looks up bookings/rider records while doing so.",
        modules: {
            dashboard: ["view"],
            support: ["view", "reply"],
            users: ["view"],
            bookings: ["view"],
            notifications: ["view", "send"],
        },
    },
    finance_staff: {
        label: "Finance Staff",
        description: "Payments, refunds, reconciliation, and plan pricing.",
        modules: {
            dashboard: ["view"],
            payments: ["view", "refund"],
            reconciliation: ["view"],
            plans: ["view", "edit"],
        },
    },
    kyc_staff: {
        label: "KYC Staff",
        description:
            "Works the KYC review queue. Reviewing raw identity documents additionally needs the " +
            "kyc_reviewer capability — granted separately under Settings → Capabilities, not by this profile.",
        modules: {
            dashboard: ["view"],
            kyc: ["view", "review"],
            users: ["view", "view_kyc"],
        },
    },
};
