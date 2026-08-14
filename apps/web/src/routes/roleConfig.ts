import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BatteryCharging,
  Bike,
  Users,
  CalendarCheck,
  CreditCard,
  Wrench,
  Settings,
  Bell,
  ShieldCheck,
  LifeBuoy,
  ScrollText,
  Layers,
  Scale,
  Eye,
  FileLock2,
} from "lucide-react";
import type { ModuleKey, Role, StaffUser } from "@/types";
import { hasModule } from "@/lib/permissions";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
  /**
   * Which staff_permissions grant unlocks this item for a `staff` account.
   * Omitted = always visible to any role listed in `roles` (e.g. Dashboard),
   * since it needs no individual grant. Admin never consults this — admin
   * access is unconditional regardless of moduleKey.
   */
  moduleKey?: ModuleKey;
  /**
   * Routed but not in the sidebar — reached from a link, a detail page or a
   * redirect. Still needs an entry here so isRouteAllowedForUser can
   * authorise it, because it denies anything it does not recognise.
   */
  hidden?: boolean;
}

/**
 * Single source of truth for sidebar navigation + route guarding.
 * Admin sees everything. Staff sees Dashboard plus whichever modules they've
 * been individually granted (see Settings → Roles & Staff) — this is a UX
 * convenience layer only; apps/backend/src/middleware/authorize.middleware.ts
 * requireModule() is what actually enforces it.
 *
 * NOTE ON THE SECOND LAYER: module access decides which SECTIONS a staff
 * member can open. Whether they may see raw personal data INSIDE one is a
 * separate question — the DPDPA capabilities (kyc_reviewer, rights_officer,
 * pii_exporter), enforced server-side per endpoint. Someone can hold the
 * `kyc` module and still be unable to open an Aadhaar scan. Capabilities are
 * deliberately NOT consulted for navigation: they gate actions within a
 * section, not reaching it. See the two-layer note in @/types.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] },
  // Previously hard admin-only ("every write route is requireAdmin, showing
  // this to staff would just be a wall of 403s") — now delegable like every
  // other module now that real per-action checks exist server-side.
  {
    label: "Battery Stations",
    path: "/battery-stations",
    icon: BatteryCharging,
    roles: ["admin", "staff"],
    moduleKey: "battery_stations",
  },
  { label: "Vehicles", path: "/vehicles", icon: Bike, roles: ["admin", "staff"], moduleKey: "vehicles" },
  { label: "Users", path: "/users", icon: Users, roles: ["admin", "staff"], moduleKey: "users" },
  { label: "KYC Queue", path: "/kyc", icon: ShieldCheck, roles: ["admin", "staff"], moduleKey: "kyc" },
  {
    label: "Rental Operations",
    path: "/bookings",
    icon: CalendarCheck,
    roles: ["admin", "staff"],
    moduleKey: "bookings",
  },
  { label: "Maintenance", path: "/maintenance", icon: Wrench, roles: ["admin", "staff"], moduleKey: "maintenance" },
  { label: "Support Tickets", path: "/support", icon: LifeBuoy, roles: ["admin", "staff"], moduleKey: "support" },
  { label: "Payments", path: "/payments", icon: CreditCard, roles: ["admin", "staff"], moduleKey: "payments" },
  { label: "Plans", path: "/plans", icon: Layers, roles: ["admin", "staff"], moduleKey: "plans" },
  {
    label: "Reconciliation",
    path: "/reconciliation",
    icon: Scale,
    roles: ["admin", "staff"],
    moduleKey: "reconciliation",
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    roles: ["admin", "staff"],
    moduleKey: "notifications",
  },
  // Data-principal rights queue. Gated by the `privacy` module here and
  // additionally by the rights_officer capability on the server — reaching
  // the queue and being allowed to action a request are different questions.
  //
  // Distinct path prefix from /privacy/access-log, so the longest-prefix
  // match below keeps them apart. Do not add a bare "/privacy" entry — it
  // would swallow both.
  {
    label: "Privacy Requests",
    path: "/privacy/requests",
    icon: FileLock2,
    roles: ["admin", "staff"],
    moduleKey: "privacy",
  },
  {
    label: "PII Access Log",
    path: "/privacy/access-log",
    icon: Eye,
    roles: ["admin", "staff"],
    moduleKey: "pii_access_log",
  },
  { label: "Audit Log", path: "/audit", icon: ScrollText, roles: ["admin", "staff"], moduleKey: "audit" },
  // Delegable for the generic Company/Security/API Keys/Branding tabs only —
  // SettingsPage.tsx hard-codes the Roles & Staff / Capabilities / Staff
  // Access tabs to role === "admin" regardless of this grant. See the
  // carve-out note there.
  { label: "Settings", path: "/settings", icon: Settings, roles: ["admin", "staff"], moduleKey: "settings" },

  // --- routed but not in the sidebar ---------------------------------------
  // The module keys match what the backend already enforces (damages.routes.ts
  // and refunds.routes.ts both use requireModule), so the console and the API
  // agree rather than the UI admitting someone to meet a wall of 403s.
  { label: "Damages", path: "/damages", icon: Scale, roles: ["admin", "staff"], moduleKey: "damages", hidden: true },
  { label: "Refunds", path: "/refunds", icon: Scale, roles: ["admin"], moduleKey: "refunds", hidden: true },
  // The full-page permission matrix — reached from Staff Access / the Users
  // page, never from the sidebar. Admin-only in practice (StaffAccessSection
  // only links here for admins), but still needs an entry so
  // isRouteAllowedForUser doesn't fail-closed-deny it for the admin who does
  // reach it. hidden:true + longest-prefix match covers the dynamic :userId.
  {
    label: "Manage Permissions",
    path: "/settings/staff-access",
    icon: Settings,
    roles: ["admin"],
    hidden: true,
  },
  { label: "Forbidden", path: "/403", icon: Scale, roles: ["admin", "staff"], hidden: true },
];

/** What canAccess needs — capabilities are not part of navigation. */
type AccessUser = Pick<StaffUser, "role" | "permissions">;

/** True if `user` (admin or staff) can see/use this nav item. */
function canAccess(item: NavItem, user: AccessUser): boolean {
  if (!item.roles.includes(user.role)) return false;
  if (user.role === "admin") return true; // unconditional, never consults moduleKey
  if (!item.moduleKey) return true; // e.g. Dashboard — no grant needed
  return hasModule(user, item.moduleKey); // any action granted = section may be opened
}

export function navForUser(user: AccessUser) {
  return NAV_ITEMS.filter((item) => !item.hidden && canAccess(item, user));
}

/**
 * Longest-prefix match, so "/privacy/access-log" is never resolved by the
 * "/privacy/requests" entry, or vice versa.
 */
function matchPath(path: string): NavItem | undefined {
  const hits = NAV_ITEMS.filter((n) => path === n.path || path.startsWith(n.path + "/"));
  if (hits.length === 0) return undefined;
  return hits.sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * DENIES anything it does not recognise.
 *
 * This previously returned true for an unmatched path, which meant a new page
 * added to AppRoutes.tsx shipped reachable by every staff account and nobody
 * found out. Adding a <Route> without a NAV_ITEMS entry (with `hidden: true`
 * if it has no sidebar item) now 403s loudly instead — a loud failure beats a
 * silent authorisation hole.
 */
export function isRouteAllowedForUser(path: string, user: AccessUser) {
  const item = matchPath(path);
  if (!item) return false;
  return canAccess(item, user);
}
