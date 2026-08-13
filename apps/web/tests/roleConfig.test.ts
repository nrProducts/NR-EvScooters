import { describe, expect, it } from "vitest";
import { navForUser, isRouteAllowedForUser, NAV_ITEMS } from "../src/routes/roleConfig";

describe("navForUser", () => {
  it("gives admin every nav item, regardless of permissions", () => {
    const items = navForUser({ role: "admin", permissions: null });
    expect(items.length).toBe(NAV_ITEMS.length);
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

  it("defaults to allowed for a path with no matching nav item (e.g. a detail page)", () => {
    expect(isRouteAllowedForUser("/damages/some-id", { role: "staff", permissions: [] })).toBe(true);
  });
});
