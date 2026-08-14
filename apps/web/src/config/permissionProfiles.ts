import type { ModuleKey } from "@/types";

/**
 * Mirrors apps/backend/src/config/permissionProfiles.ts — keep both in sync
 * by hand, same convention as MODULE_KEYS/MODULE_ACTIONS (no shared package
 * in this monorepo). Static config: the product spec names exactly these
 * five profiles and doesn't ask for admin-editable profile definitions.
 */
export type PermissionProfileName =
  | "viewer" | "operations_staff" | "support_staff" | "finance_staff" | "kyc_staff" | "custom";

export const PERMISSION_PROFILE_NAMES: readonly Exclude<PermissionProfileName, "custom">[] = [
  "viewer", "operations_staff", "support_staff", "finance_staff", "kyc_staff",
];

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
      dashboard: ["view"], vehicles: ["view"], users: ["view"], kyc: ["view"],
      bookings: ["view"], maintenance: ["view"], support: ["view"], payments: ["view"],
      plans: ["view"], notifications: ["view"], privacy: ["view"],
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
      dashboard: ["view"], support: ["view", "reply"], users: ["view"],
      bookings: ["view"], notifications: ["view", "send"],
    },
  },
  finance_staff: {
    label: "Finance Staff",
    description: "Payments, refunds, reconciliation, and plan pricing.",
    modules: {
      dashboard: ["view"], payments: ["view", "refund"], reconciliation: ["view"],
      plans: ["view", "edit"],
    },
  },
  kyc_staff: {
    label: "KYC Staff",
    description:
      "Works the KYC review queue. Reviewing raw identity documents additionally needs the kyc_reviewer " +
      "capability — granted separately under Settings → Capabilities, not by this profile.",
    modules: {
      dashboard: ["view"], kyc: ["view", "review"], users: ["view", "view_kyc"],
    },
  },
};

/** Reverse lookup for the Staff Access table's "Profile" column — best-effort exact-match only. */
export function matchProfileName(modules: { module_key: ModuleKey; actions: string[] }[]): PermissionProfileName {
  const normalised = (mods: { module_key: ModuleKey; actions: string[] }[]) =>
    [...mods]
      .map((m) => [m.module_key, [...m.actions].sort().join(",")] as const)
      .sort(([a], [b]) => a.localeCompare(b));

  const current = normalised(modules.filter((m) => m.actions.length > 0));

  for (const name of PERMISSION_PROFILE_NAMES) {
    const preset = PERMISSION_PROFILES[name].modules;
    const presetModules = Object.entries(preset).map(([module_key, actions]) => ({
      module_key: module_key as ModuleKey,
      actions: [...(actions ?? [])],
    }));
    const candidate = normalised(presetModules);
    if (
      candidate.length === current.length &&
      candidate.every(([m, a], i) => current[i][0] === m && current[i][1] === a)
    ) {
      return name;
    }
  }
  return "custom";
}
