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
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
}

/**
 * Single source of truth for sidebar navigation + route guarding.
 * Staff sees only operational modules; Admin sees everything.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] },
  // Admin-only: every write on /admin/battery-stations is requireAdmin, so
  // showing this to staff would only lead them to a wall of 403s.
  { label: "Battery Stations", path: "/battery-stations", icon: BatteryCharging, roles: ["admin"] },
  { label: "Vehicles", path: "/vehicles", icon: Bike, roles: ["admin", "staff"] },
  { label: "Users", path: "/users", icon: Users, roles: ["admin", "staff"] },
  { label: "KYC Queue", path: "/kyc", icon: ShieldCheck, roles: ["admin", "staff"] },
  { label: "Bookings", path: "/bookings", icon: CalendarCheck, roles: ["admin", "staff"] },
  { label: "Maintenance", path: "/maintenance", icon: Wrench, roles: ["admin", "staff"] },
  { label: "Support Tickets", path: "/support", icon: LifeBuoy, roles: ["admin", "staff"] },
  { label: "Payments", path: "/payments", icon: CreditCard, roles: ["admin"] },
  { label: "Plans", path: "/plans", icon: Layers, roles: ["admin"] },
  { label: "Reconciliation", path: "/reconciliation", icon: Scale, roles: ["admin"] },
  { label: "Notifications", path: "/notifications", icon: Bell, roles: ["admin"] },
  // Distinct prefixes, so the longest-prefix match in isRouteAllowed keeps
  // them apart. Do not add a bare "/privacy" entry — it would swallow both.
  { label: "Privacy Requests", path: "/privacy/requests", icon: FileLock2, roles: ["admin", "staff"] },
  { label: "PII Access Log", path: "/privacy/access-log", icon: Eye, roles: ["admin"] },
  { label: "Audit Log", path: "/audit", icon: ScrollText, roles: ["admin"] },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["admin"] },
];

/**
 * Routes that exist in AppRoutes.tsx but deliberately have no sidebar entry —
 * reached from a link, a detail page or a redirect. They must still declare
 * who may open them, because isRouteAllowed now denies anything it does not
 * recognise.
 *
 * IMPORTANT: adding a <Route> to AppRoutes.tsx without adding it here or to
 * NAV_ITEMS will make it 403 for everyone. That is intentional. The previous
 * behaviour was to allow unknown routes by default, which meant a new page
 * shipped wide open and nobody found out. A loud failure beats a silent
 * authorisation hole.
 */
const NON_NAV_ROUTE_ROLES: Record<string, Role[]> = {
  "/damages": ["admin", "staff"],
  "/refunds": ["admin"],
  "/403": ["admin", "staff"],
};

export function navForRole(role: Role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Longest-prefix match, so "/privacy/access-log" cannot be swallowed by "/privacy". */
function matchByPrefix(entries: [string, Role[]][], path: string): Role[] | undefined {
  const hits = entries.filter(([p]) => path === p || path.startsWith(p + "/"));
  if (hits.length === 0) return undefined;
  return hits.sort((a, b) => b[0].length - a[0].length)[0][1];
}

export function isRouteAllowed(path: string, role: Role) {
  const navRoles = matchByPrefix(
    NAV_ITEMS.map((n) => [n.path, n.roles] as [string, Role[]]),
    path,
  );
  if (navRoles) return navRoles.includes(role);

  const otherRoles = matchByPrefix(Object.entries(NON_NAV_ROUTE_ROLES), path);
  if (otherRoles) return otherRoles.includes(role);

  return false; // deny by default — a new page must opt in
}
