import { describe, expect, it } from "vitest";
import { navForUser, isRouteAllowedForUser, NAV_ITEMS } from "../src/routes/roleConfig";

describe("navForUser", () => {
  it("gives admin every sidebar item, regardless of permissions", () => {
    const items = navForUser({ role: "admin", permissions: null });
    // NAV_ITEMS now also carries `hidden` entries for routes that exist but
    // have no sidebar item (/damages, /refunds, /403) — they still need an
    // entry so isRouteAllowedForUser can authorise them. Compare against the
    // visible subset rather than the whole list.
    const visible = NAV_ITEMS.filter((i) => !i.hidden);
    expect(items.length).toBe(visible.length);
    expect(items.some((i) => i.hidden)).toBe(false);
  });

  it("gives staff only Dashboard when they hold no module grants", () => {
    const items = navForUser({ role: "staff", permissions: [] });
    expect(items.map((i) => i.label)).toEqual(["Dashboard"]);
  });

  it("gives staff exactly the modules they've been granted, plus Dashboard", () => {
    const items = navForUser({ role: "staff", permissions: ["vehicles", "bookings"] });
    expect(items.map((i) => i.label).sort()).toEqual(["Bookings", "Dashboard", "Vehicles"]);
  });

  it("never shows admin-only items to staff, even with every module granted", () => {
    const items = navForUser({
      role: "staff",
      permissions: ["vehicles", "users", "kyc", "bookings", "maintenance", "support", "payments", "notifications", "damages", "refunds"],
    });
    expect(items.some((i) => i.label === "Plans")).toBe(false);
    expect(items.some((i) => i.label === "Settings")).toBe(false);
    expect(items.some((i) => i.label === "Battery Stations")).toBe(false);
  });
});

describe("isRouteAllowedForUser", () => {
  it("allows admin anywhere", () => {
    expect(isRouteAllowedForUser("/plans", { role: "admin", permissions: null })).toBe(true);
  });

  it("blocks staff from a module they don't hold", () => {
    expect(isRouteAllowedForUser("/payments", { role: "staff", permissions: ["vehicles"] })).toBe(false);
  });

  it("allows staff into a module they hold, including nested detail routes", () => {
    expect(isRouteAllowedForUser("/vehicles", { role: "staff", permissions: ["vehicles"] })).toBe(true);
    expect(isRouteAllowedForUser("/vehicles/some-id", { role: "staff", permissions: ["vehicles"] })).toBe(true);
  });

  // BEHAVIOUR CHANGED IN THE DPDPA MERGE, deliberately.
  //
  // This previously defaulted to ALLOWED for any unmatched path, which meant a
  // page added to AppRoutes.tsx was reachable by every staff account until
  // someone noticed. It also disagreed with the backend, which already gates
  // /damages and /refunds with requireModule() — so the console admitted
  // people the API then refused.
  //
  // /damages and /refunds are now `hidden` NAV_ITEMS carrying the same module
  // keys the backend enforces, and anything genuinely unknown is denied.
  it("denies a staff account a module route they do not hold, including detail paths", () => {
    expect(isRouteAllowedForUser("/damages/some-id", { role: "staff", permissions: [] })).toBe(false);
  });

  it("allows a staff account into a hidden route once the matching module is granted", () => {
    expect(isRouteAllowedForUser("/damages/some-id", { role: "staff", permissions: ["damages"] })).toBe(true);
  });

  it("denies a path that matches no entry at all, rather than defaulting open", () => {
    expect(isRouteAllowedForUser("/some-new-page", { role: "admin", permissions: null })).toBe(false);
    expect(isRouteAllowedForUser("/some-new-page", { role: "staff", permissions: [] })).toBe(false);
  });

  // Longest-prefix matching: these two share the /privacy prefix but are
  // different pages with different audiences.
  it("keeps the two /privacy routes apart", () => {
    const staffWithPrivacy = { role: "staff" as const, permissions: ["privacy" as const] };
    expect(isRouteAllowedForUser("/privacy/requests", staffWithPrivacy)).toBe(true);
    // Access log is admin-only, and must not be unlocked by the privacy module.
    expect(isRouteAllowedForUser("/privacy/access-log", staffWithPrivacy)).toBe(false);
    expect(isRouteAllowedForUser("/privacy/access-log", { role: "admin", permissions: null })).toBe(true);
  });
});
