import { describe, expect, it } from "vitest";
import { buildTrail, type TrailEntry } from "../src/lib/navTrail";

/** History as a list of URLs, slot 0 first; the last one is the current page. */
function history(...urls: string[]) {
  const entries: Record<number, TrailEntry> = {};
  urls.forEach((url, idx) => {
    const [pathname, search = ""] = url.split("?");
    entries[idx] = { idx, key: `k${idx}`, pathname, search: search ? `?${search}` : "" };
  });
  return { entries, current: entries[urls.length - 1] };
}

describe("buildTrail", () => {
  it("is a single crumb on a section page, so no breadcrumbs are drawn", () => {
    const { entries, current } = history("/dashboard", "/users");
    expect(buildTrail(entries, {}, current)).toHaveLength(1);
  });

  it("follows the page a user was actually opened from, not the Users list", () => {
    const { entries, current } = history("/users", "/bookings?tab=active", "/users/u1");
    const trail = buildTrail(entries, { k2: "Priya S" }, current);
    expect(trail.map((c) => c.label)).toEqual(["Rental Operations", "Priya S"]);
    // Back is one step of history, which restores the tab from the URL.
    expect(trail[0]).toMatchObject({ to: "/bookings?tab=active", delta: -1 });
  });

  it("chains detail pages reached through each other", () => {
    const { entries, current } = history("/kyc", "/users/u1", "/vehicles/v1", "/bookings/returns/r1");
    const trail = buildTrail(entries, { k1: "Priya S", k2: "TN22AB0005" }, current);
    expect(trail.map((c) => c.label)).toEqual(["KYC Queue", "Priya S", "TN22AB0005", "Return review"]);
    expect(trail.map((c) => c.delta)).toEqual([-3, -2, -1, 0]);
  });

  it("falls back to the route's own section when opened cold", () => {
    const { entries, current } = history("/users/u1");
    const trail = buildTrail(entries, {}, current);
    expect(trail.map((c) => c.label)).toEqual(["Users", "User"]);
    expect(trail[0]).toMatchObject({ to: "/users", delta: null });
  });

  it("does not offer a page outside the console as a place to go back to", () => {
    const { entries, current } = history("/login", "/bookings/returns/r1");
    const trail = buildTrail(entries, {}, current);
    expect(trail[0]).toMatchObject({ label: "Rental Operations", to: "/bookings", delta: null });
  });

  it("stops at a gap in what was recorded", () => {
    const { entries, current } = history("/vehicles", "/users/u1", "/vehicles/v1");
    delete entries[1];
    const trail = buildTrail(entries, {}, current);
    expect(trail.map((c) => c.to)).toEqual(["/vehicles", "/vehicles/v1"]);
    expect(trail[0].delta).toBeNull();
  });

  it("sends a cold-opened permissions page back to the Staff Access tab", () => {
    const { entries, current } = history("/settings/staff-access/u1/permissions");
    expect(buildTrail(entries, {}, current)[0]).toMatchObject({
      label: "Settings",
      to: "/settings?tab=staff-access",
    });
  });
});
