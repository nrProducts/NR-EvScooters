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
  { label: "Notifications", path: "/notifications", icon: Bell, roles: ["admin"] },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["admin"] },
];

export function navForRole(role: Role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function isRouteAllowed(path: string, role: Role) {
  const item = NAV_ITEMS.find((n) => path === n.path || path.startsWith(n.path + "/"));
  if (!item) return true; // routes not in nav (e.g. detail pages) are allowed by default
  return item.roles.includes(role);
}
