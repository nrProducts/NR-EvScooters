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

describe("navForUser", () => {
  it("gives admin every sidebar item, regardless of permissions", () => {
    const items = navForUser({ role: "admin", permissions: null });
    // NAV_ITEMS also carries `hidden` entries for routes that exist but have
    // no sidebar item (/damages, /403, the settings sub-pages) — they still
    // need an entry so isRouteAllowedForUser can authorise them. Compare
    // against the visible subset rather than the whole list.
    const visible = NAV_ITEMS.filter((i) => !i.hidden);
    expect(items.length).toBe(visible.length);
    expect(items.some((i) => i.hidden)).toBe(false);
  });

  it("gives staff only Dashboard when they hold no module grants", () => {
    const items = navForUser({ role: "staff", permissions: [] });
    expect(items.map((i) => i.label)).toEqual(["Dashboard"]);
  });

  it("gives staff exactly the modules they've been granted, plus Dashboard", () => {
    const items = navForUser({ role: "staff", permissions: grants("vehicles", "bookings") });
    expect(items.map((i) => i.label).sort()).toEqual(["Dashboard", "Rental Operations", "Vehicles"]);
  });

  it("ignores a module grant that carries no actions", () => {
    // `hasModule` requires at least one action — an empty grant is not access.
    const items = navForUser({
      role: "staff",
      permissions: [{ module_key: "vehicles", actions: [] }],
    });
    expect(items.map((i) => i.label)).toEqual(["Dashboard"]);
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
    expect(items.map((i) => i.label).sort()).toEqual(["Billing & Charges", "Dashboard", "Refunds"]);
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
