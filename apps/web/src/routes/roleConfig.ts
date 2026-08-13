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
} from "lucide-react";
import type { ModuleKey, Role, StaffUser } from "@/types";

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
}

/**
 * Single source of truth for sidebar navigation + route guarding.
 * Admin sees everything. Staff sees Dashboard plus whichever modules they've
 * been individually granted (see Settings → Roles & Staff) — this is a UX
 * convenience layer only; apps/backend/src/middleware/authorize.middleware.ts
 * requireModule() is what actually enforces it.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] },
  // Admin-only: every write on /admin/battery-stations is requireAdmin, so
  // showing this to staff would only lead them to a wall of 403s.
  { label: "Battery Stations", path: "/battery-stations", icon: BatteryCharging, roles: ["admin"] },
  { label: "Vehicles", path: "/vehicles", icon: Bike, roles: ["admin", "staff"], moduleKey: "vehicles" },
  { label: "Users", path: "/users", icon: Users, roles: ["admin", "staff"], moduleKey: "users" },
  { label: "KYC Queue", path: "/kyc", icon: ShieldCheck, roles: ["admin", "staff"], moduleKey: "kyc" },
  { label: "Bookings", path: "/bookings", icon: CalendarCheck, roles: ["admin", "staff"], moduleKey: "bookings" },
  { label: "Maintenance", path: "/maintenance", icon: Wrench, roles: ["admin", "staff"], moduleKey: "maintenance" },
  { label: "Support Tickets", path: "/support", icon: LifeBuoy, roles: ["admin", "staff"], moduleKey: "support" },
  { label: "Payments", path: "/payments", icon: CreditCard, roles: ["admin", "staff"], moduleKey: "payments" },
  { label: "Plans", path: "/plans", icon: Layers, roles: ["admin"] },
  { label: "Reconciliation", path: "/reconciliation", icon: Scale, roles: ["admin"] },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    roles: ["admin", "staff"],
    moduleKey: "notifications",
  },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["admin"] },
];

/** True if `user` (admin or staff) can see/use this nav item. */
function canAccess(item: NavItem, user: Pick<StaffUser, "role" | "permissions">): boolean {
  if (!item.roles.includes(user.role)) return false;
  if (user.role === "admin") return true; // unconditional, never consults moduleKey
  if (!item.moduleKey) return true; // e.g. Dashboard — no grant needed
  return user.permissions?.includes(item.moduleKey) ?? false;
}

export function navForUser(user: Pick<StaffUser, "role" | "permissions">) {
  return NAV_ITEMS.filter((item) => canAccess(item, user));
}

export function isRouteAllowedForUser(path: string, user: Pick<StaffUser, "role" | "permissions">) {
  const item = NAV_ITEMS.find((n) => path === n.path || path.startsWith(n.path + "/"));
  if (!item) return true; // routes not in nav (e.g. detail pages) are allowed by default
  return canAccess(item, user);
}
