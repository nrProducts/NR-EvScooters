import { describe, expect, it } from "vitest";
import { navForUser, isRouteAllowedForUser, NAV_ITEMS } from "../src/routes/roleConfig";
import type { ModulePermission } from "../src/types";

/**
 * ── WHY THERE IS A HELPER HERE ───────────────────────────────────────────
 *
 * These tests used to pass `permissions: ["vehicles", "bookings"]` — a bare
 * array of module keys. That was the OLD shape. `StaffUser.permissions` is
 * `ModulePermission[]` now (`{ module_key, actions }`), because a grant is
 * per-ACTION rather than per-module, and `hasModule` reads
 * `p.module_key && p.actions.length > 0`.
 *
 * A string has neither property, so every one of these assertions was
 * evaluating `undefined === "vehicles"` → false. Four tests failed outright;
 * worse, the ones that asserted DENIAL still passed — for the wrong reason.
 * A route-guard suite that cannot distinguish "correctly denied" from
 * "denied because the fixture was malformed" is not testing the guard.
 *
 * `grants()` builds the real shape, so the suite exercises what ships.
 */
function grants(...moduleKeys: string[]): ModulePermission[] {
  return moduleKeys.map((module_key) => ({ module_key, actions: ["view"] }));
}

/**
 * The "My HR" self-service items: roles ["staff"] and deliberately NO
 * moduleKey, so `canAccess` short-circuits to true for every staff account.
 * The backend gates them with requireStaff rather than requireAction, so
 * hiding them behind hasModule() would wrongly deny a staff member their own
 * profile, attendance and leave.
 *
 * They are staff-only, which is also why admin does not see every visible
 * NAV_ITEM. Every staff expectation below is built from this rather than
 * repeating the three labels, so adding a fourth self-service page is a
 * one-line change here instead of a four-test edit.
 */
const SELF_SERVICE = ["My Attendance", "My Leave", "My Profile"];

/** What a staff user always sees, plus whatever their grants add. */
function staffBaseline(...extra: string[]): string[] {
  return [...SELF_SERVICE, "Dashboard", ...extra].sort();
}

describe("navForUser", () => {
  it("gives admin every sidebar item they are eligible for, regardless of permissions", () => {
    const items = navForUser({ role: "admin", permissions: null });
    // Two exclusions, and they are different things:
    //
    //   `hidden` entries are routes with no sidebar item (/damages, /403, the
    //   settings sub-pages). They still need a NAV_ITEMS entry so
    //   isRouteAllowedForUser can authorise them.
    //
    //   The "My HR" items are visible but staff-only — an admin has no "My
    //   Attendance". So this is no longer "every visible item"; it is every
    //   visible item whose roles include admin.
    const eligible = NAV_ITEMS.filter((i) => !i.hidden && i.roles.includes("admin"));
    expect(items.length).toBe(eligible.length);
    expect(items.some((i) => i.hidden)).toBe(false);
    expect(items.some((i) => SELF_SERVICE.includes(i.label))).toBe(false);
  });

  it("gives staff their self-service pages without any module grant", () => {
    const items = navForUser({ role: "staff", permissions: [] });
    for (const label of SELF_SERVICE) {
      expect(items.map((i) => i.label), `${label} needs no grant`).toContain(label);
    }
  });

  it("gives staff only Dashboard and self-service when they hold no module grants", () => {
    const items = navForUser({ role: "staff", permissions: [] });
    expect(items.map((i) => i.label).sort()).toEqual(staffBaseline());
  });

  it("gives staff exactly the modules they've been granted, plus Dashboard", () => {
    const items = navForUser({ role: "staff", permissions: grants("vehicles", "bookings") });
    expect(items.map((i) => i.label).sort())
      .toEqual(staffBaseline("Rental Operations", "Vehicles"));
  });

  it("ignores a module grant that carries no actions", () => {
    // `hasModule` requires at least one action — an empty grant is not access.
    const items = navForUser({
      role: "staff",
      permissions: [{ module_key: "vehicles", actions: [] }],
    });
    expect(items.map((i) => i.label).sort()).toEqual(staffBaseline());
  });

  it("never shows admin-only items to staff, even with every module granted", () => {
    const items = navForUser({
      role: "staff",
      permissions: grants(
        "vehicles", "users", "kyc", "bookings", "maintenance", "support",
        "payments", "notifications", "damages", "refunds", "billing", "plans",
        "settings", "battery_stations",
      ),
    });
    // The settings SUB-pages are admin-only and hidden; the tab carve-out in
    // SettingsPage.tsx plus requireAdmin on every underlying endpoint is what
    // actually enforces that.
    expect(items.some((i) => i.label === "Manage Permissions")).toBe(false);
    expect(items.some((i) => i.label === "Notification Manager")).toBe(false);
  });

  it("shows Refunds and Billing to staff who hold them", () => {
    // These were roles:["admin"] in the nav while the backend gated them on
    // ordinary delegable permissions — frontend hiding standing in for a
    // control that did not exist. Resolved in favour of delegable; the
    // per-action split (refunds.view vs refunds.approve) is what limits them.
    const items = navForUser({ role: "staff", permissions: grants("refunds", "billing") });
    expect(items.map((i) => i.label).sort())
      .toEqual(staffBaseline("Billing & Charges", "Refunds"));
  });
});

describe("isRouteAllowedForUser", () => {
  it("allows admin anywhere", () => {
    expect(isRouteAllowedForUser("/plans", { role: "admin", permissions: null })).toBe(true);
  });

  it("blocks staff from a module they don't hold", () => {
    expect(isRouteAllowedForUser("/payments", { role: "staff", permissions: grants("vehicles") })).toBe(false);
  });

  it("allows staff into a module they hold, including nested detail routes", () => {
    expect(isRouteAllowedForUser("/vehicles", { role: "staff", permissions: grants("vehicles") })).toBe(true);
    expect(isRouteAllowedForUser("/vehicles/some-id", { role: "staff", permissions: grants("vehicles") })).toBe(true);
  });

  // BEHAVIOUR CHANGED IN THE DPDPA MERGE, deliberately.
  //
  // This previously defaulted to ALLOWED for any unmatched path, which meant a
  // page added to AppRoutes.tsx was reachable by every staff account until
  // someone noticed. It also disagreed with the backend, which already gates
  // /damages and /refunds — so the console admitted people the API then
  // refused.
  //
  // /damages is now a `hidden` NAV_ITEM carrying the same module key the
  // backend enforces, and anything genuinely unknown is denied.
  it("denies a staff account a module route they do not hold, including detail paths", () => {
    expect(isRouteAllowedForUser("/damages/some-id", { role: "staff", permissions: [] })).toBe(false);
  });

  it("allows a staff account into a hidden route once the matching module is granted", () => {
    expect(isRouteAllowedForUser("/damages/some-id", { role: "staff", permissions: grants("damages") })).toBe(true);
  });

  it("denies a path that matches no entry at all, rather than defaulting open", () => {
    expect(isRouteAllowedForUser("/some-new-page", { role: "admin", permissions: null })).toBe(false);
    expect(isRouteAllowedForUser("/some-new-page", { role: "staff", permissions: [] })).toBe(false);
  });

  // Longest-prefix matching: these two share the /privacy prefix but are
  // different pages with different audiences.
  it("keeps the two /privacy routes apart", () => {
    const staffWithPrivacy = { role: "staff" as const, permissions: grants("privacy") };
    expect(isRouteAllowedForUser("/privacy/requests", staffWithPrivacy)).toBe(true);
    // The access log has its own module and must not be unlocked by `privacy`.
    expect(isRouteAllowedForUser("/privacy/access-log", staffWithPrivacy)).toBe(false);
    expect(isRouteAllowedForUser("/privacy/access-log", { role: "admin", permissions: null })).toBe(true);
  });

  it("keeps the admin-only settings sub-pages closed to staff who hold `settings`", () => {
    const staffWithSettings = { role: "staff" as const, permissions: grants("settings") };
    expect(isRouteAllowedForUser("/settings/staff-access", staffWithSettings)).toBe(false);
    expect(isRouteAllowedForUser("/settings/notification-manager", staffWithSettings)).toBe(false);
  });
});
