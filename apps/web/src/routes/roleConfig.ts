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
  Undo2,
  Receipt,
  Boxes,
  UserRound,
  Wallet,
  LineChart,
  Headset,
  ShieldAlert,
  UserCog,
  IdCard,
  ClipboardList,
  CalendarClock,
  CalendarOff,
} from "lucide-react";
import type { ModuleKey, Role, StaffUser } from "@/types";
import { hasModule } from "@/lib/permissions";

/** Accordion sections the sidebar groups related screens into — see NAV_GROUPS below. Dashboard and Settings sit outside any group. */
export type NavGroupKey = "fleet" | "people" | "finance" | "support" | "compliance" | "hrms" | "my_hr";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
  /**
   * Which permission module unlocks this item for a `staff` account —
   * a `modules.key`, resolved through v_user_effective_permissions.
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
  /** Which sidebar accordion section this item nests under. Omitted = rendered flat, outside any group (Dashboard, Settings). */
  group?: NavGroupKey;
}

/** Accordion section metadata — label/icon shown on the collapsible group header. Render order = this array's order. */
export const NAV_GROUPS: { key: NavGroupKey; label: string; icon: LucideIcon }[] = [
  { key: "fleet", label: "Fleet Operations", icon: Boxes },
  { key: "people", label: "People", icon: UserRound },
  { key: "finance", label: "Finance", icon: Wallet },
  { key: "support", label: "Support & Comms", icon: Headset },
  // Mini HRMS — "hrms" (admin: Attendance, Leave) and "my_hr" (staff: My
  // Profile, My Attendance, My Leave) never both appear for the same user
  // (their items' `roles` are mutually exclusive), so their relative order
  // to each other is moot.
  { key: "hrms", label: "HR Management", icon: UserCog },
  { key: "my_hr", label: "My HR", icon: IdCard },
  { key: "compliance", label: "Compliance", icon: ShieldAlert },
];

/**
 * Single source of truth for sidebar navigation + route guarding.
 *
 * Admin sees everything. Staff sees Dashboard plus whichever modules they have
 * been granted (Settings → Staff Access). This is a UX convenience layer only:
 * apps/backend/src/middleware/authorize.middleware.ts is what enforces it, and
 * hiding a nav item has never been a control.
 *
 * NOTE ON THE SECOND LAYER: `moduleKey` decides which SECTIONS a staff member
 * may open — the coarse "any permission in this module" test. What they may DO
 * inside one is the finer `<module>.<action>` grant, checked per route by
 * requireAction(): `refunds.view` opens the Refunds page, `refunds.approve`
 * issues a refund from it. Actions are deliberately NOT consulted for
 * navigation.
 *
 * The DPDPA capabilities this comment used to describe — kyc_reviewer,
 * rights_officer, pii_exporter — no longer exist as a separate axis. They are
 * ordinary permissions now: `kyc.reveal_number`, `privacy.process`,
 * `privacy.export`, granted from the same matrix as everything else. One
 * table, one middleware, one screen.
 */
/**
 * Array order = sidebar render order within each section (Sidebar.tsx groups
 * items by `group` into accordion sections per NAV_GROUPS, preserving each
 * item's position within its group). Dashboard and Settings have no `group`
 * — they render flat, pinned at the top and bottom respectively. Order has no
 * effect on access control — canAccess depends only on roles/moduleKey, and
 * matchPath() below sorts by path length, not array position.
 */
export const NAV_ITEMS: NavItem[] = [
  // Ungrouped — always pinned at the top, outside any accordion section.
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] },

  // --- Fleet Operations — bookings, the fleet itself, and the stations that keep it running ---
  {
    label: "Rental Operations",
    path: "/bookings",
    icon: CalendarCheck,
    roles: ["admin", "staff"],
    moduleKey: "bookings",
    group: "fleet",
  },
  {
    label: "Vehicles", path: "/vehicles", icon: Bike, roles: ["admin", "staff"], moduleKey: "vehicles", group: "fleet",
  },
  // Return review + settlement (Return Requests/Recovery/Settled) merged
  // into Rental Operations above as extra tabs — no longer its own sidebar
  // item or list page. Its detail route is /bookings/returns/:rentalId (see
  // AppRoutes.tsx) — nested under /bookings on purpose, so it's recognised
  // as part of Rental Operations by matchPath()/Sidebar's own
  // longest-prefix matching without needing a separate NAV_ITEMS entry
  // (hidden or otherwise) just to avoid 403ing it.
  // Previously hard admin-only ("every write route is requireAdmin, showing
  // this to staff would just be a wall of 403s") — now delegable like every
  // other module now that real per-action checks exist server-side.
  {
    label: "Battery Stations",
    path: "/battery-stations",
    icon: BatteryCharging,
    roles: ["admin", "staff"],
    moduleKey: "battery_stations",
    group: "fleet",
  },
  {
    label: "Maintenance", path: "/maintenance", icon: Wrench, roles: ["admin", "staff"], moduleKey: "maintenance", group: "fleet",
  },

  // --- People — riders and the identity checks that gate their access ---
  { label: "Users", path: "/users", icon: Users, roles: ["admin", "staff"], moduleKey: "users", group: "people" },
  {
    label: "KYC Queue", path: "/kyc", icon: ShieldCheck, roles: ["admin", "staff"], moduleKey: "kyc", group: "people",
  },

  // --- Finance — money in, money out, and reconciling it against Razorpay ---
  // Revenue is the group's analytical landing page. Gated on `dashboard.view`,
  // the same grant that opens the dashboard revenue cards it drills into — no
  // separate permission module.
  {
    label: "Revenue", path: "/revenue", icon: LineChart, roles: ["admin", "staff"], moduleKey: "dashboard", group: "finance",
  },
  {
    label: "Payments", path: "/payments", icon: CreditCard, roles: ["admin", "staff"], moduleKey: "payments", group: "finance",
  },
  // Deposit refunds and (as of the approval-gate change) booking-cancellation
  // refunds both need staff to actually see and approve them, not just reach
  // them via the "Refunds" button buried on the Payments page.
  // Delegable, not admin-only. The backend gates these on ordinary `refunds.*`
  // permissions, so listing them as roles:["admin"] here was frontend hiding
  // standing in for a control that did not exist — and the router's own
  // docstring claimed admin-only while agreeing with neither. The two now
  // match: `refunds.view` opens the section, `refunds.approve` moves money.
  {
    label: "Refunds", path: "/refunds", icon: Undo2, roles: ["admin", "staff"], moduleKey: "refunds", group: "finance",
  },
  // Configurable charge rules (transaction fee, etc.) and their materialized
  // rider charges — see 20260817100000_billing_charge_engine.sql.
  // Delegable for the same reason as Refunds above.
  {
    label: "Billing & Charges", path: "/billing", icon: Receipt, roles: ["admin", "staff"], moduleKey: "billing", group: "finance",
  },
  {
    label: "Plans", path: "/plans", icon: Layers, roles: ["admin", "staff"], moduleKey: "plans", group: "finance",
  },
  {
    label: "Reconciliation",
    path: "/reconciliation",
    icon: Scale,
    roles: ["admin", "staff"],
    moduleKey: "reconciliation",
    group: "finance",
  },

  // --- Support & Comms — the rider-facing feedback loop ---
  {
    label: "Support Tickets", path: "/support", icon: LifeBuoy, roles: ["admin", "staff"], moduleKey: "support", group: "support",
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    roles: ["admin", "staff"],
    moduleKey: "notifications",
    group: "support",
  },

  // --- HR Management (admin) — fleet-wide attendance/leave oversight ---
  // No "Staff" item here deliberately — /settings/staff-access (bare path)
  // has no route today (only /settings/staff-access/:userId/permissions
  // does), and a second item pointing at /settings would create a
  // matchPath() ambiguity with the existing pinned "Settings" entry, which
  // isn't role-separated the way /attendance vs /my-attendance is. The
  // existing "Settings" nav item already reaches Staff Access in two clicks.
  {
    label: "Attendance", path: "/attendance", icon: ClipboardList, roles: ["admin"], moduleKey: "attendance", group: "hrms",
  },
  { label: "Leave", path: "/leave", icon: CalendarClock, roles: ["admin"], moduleKey: "leave", group: "hrms" },
  {
    label: "Holidays", path: "/holidays", icon: CalendarOff, roles: ["admin"], moduleKey: "holidays", group: "hrms",
  },

  // --- My HR (staff) — self-service, no moduleKey: every staff/admin account
  // has these unconditionally (backend gates them with requireStaff, not
  // requireAction), so gating the nav with hasModule() would wrongly hide
  // them from a staff account with zero module grants. ---
  { label: "My Profile", path: "/my-profile", icon: IdCard, roles: ["staff"], group: "my_hr" },
  { label: "My Attendance", path: "/my-attendance", icon: ClipboardList, roles: ["staff"], group: "my_hr" },
  { label: "My Leave", path: "/my-leave", icon: CalendarClock, roles: ["staff"], group: "my_hr" },

  // --- Compliance — DPDPA rights, access logging and the audit trail ---
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
    group: "compliance",
  },
  {
    label: "PII Access Log",
    path: "/privacy/access-log",
    icon: Eye,
    roles: ["admin", "staff"],
    moduleKey: "pii_access_log",
    group: "compliance",
  },
  {
    label: "Audit Log", path: "/audit", icon: ScrollText, roles: ["admin", "staff"], moduleKey: "audit", group: "compliance",
  },

  // Ungrouped — pinned at the bottom, outside any accordion section.
  // Effectively admin-only in practice, and the entry stays shaped this way
  // rather than being hard-coded to ["admin"] so it says WHY.
  //
  // `settings.view` / `settings.edit` are flagged is_enforced = false in the
  // catalogue, because no route checks either and none should: everything on
  // this page that does anything (Roles & Staff, Staff Access, Notification
  // Manager) is requireAdmin at the endpoint, and the Company / Security /
  // API Keys / Branding tabs are placeholders — Security renders
  // <NotConnected/>. An unenforced permission is rendered as a disabled
  // checkbox in the matrix, so the grant cannot be handed out, so no staff
  // account passes hasModule() here.
  //
  // If a real, delegable settings surface ever ships, enforce the permission
  // on its routes and the nav follows automatically.
  { label: "Settings", path: "/settings", icon: Settings, roles: ["admin", "staff"], moduleKey: "settings" },

  // --- routed but not in the sidebar ---------------------------------------
  // The module keys match what the backend enforces (damages.routes.ts and
  // refunds.routes.ts now check specific actions), so the console and the API
  // agree rather than the UI admitting someone to meet a wall of 403s.
  { label: "Damages", path: "/damages", icon: Scale, roles: ["admin", "staff"], moduleKey: "damages", hidden: true },
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
  // Admin-only, reached via a link from the Settings page — never in the
  // sidebar. Mirrors "Manage Permissions" above: only Admin may configure who
  // gets notified for which event.
  {
    label: "Notification Manager",
    path: "/settings/notification-manager",
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

/** One rendered row in the sidebar's accordion tree: either a flat item (Dashboard, Settings) or a whole group with its member items. */
export type NavTreeEntry =
  | { type: "item"; item: NavItem }
  | { type: "group"; key: NavGroupKey; label: string; icon: LucideIcon; items: NavItem[] };

/**
 * Turns the flat, already-role-filtered item list (navForUser's output) into
 * the accordion tree Sidebar.tsx renders: items without a `group` stay flat
 * in their original position, items sharing a `group` collapse into one
 * NavTreeEntry positioned where that group's first item appeared. A group
 * with zero surviving items (every member filtered out for this user) simply
 * never appears — nothing to special-case.
 */
export function buildNavTree(items: NavItem[]): NavTreeEntry[] {
  const entries: NavTreeEntry[] = [];
  const groupEntryIndex = new Map<NavGroupKey, number>();

  for (const item of items) {
    if (!item.group) {
      entries.push({ type: "item", item });
      continue;
    }
    const existingIndex = groupEntryIndex.get(item.group);
    if (existingIndex !== undefined) {
      const entry = entries[existingIndex];
      if (entry.type === "group") entry.items.push(item);
      continue;
    }
    const meta = NAV_GROUPS.find((g) => g.key === item.group);
    if (!meta) {
      // Defensive fallback — a group key with no NAV_GROUPS entry is a bug,
      // but rendering the item flat beats silently dropping it.
      entries.push({ type: "item", item });
      continue;
    }
    groupEntryIndex.set(item.group, entries.length);
    entries.push({ type: "group", key: meta.key, label: meta.label, icon: meta.icon, items: [item] });
  }

  return entries;
}

/**
 * Longest-prefix match, so "/privacy/access-log" is never resolved by the
 * "/privacy/requests" entry, or vice versa.
 */
export function matchPath(path: string): NavItem | undefined {
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
