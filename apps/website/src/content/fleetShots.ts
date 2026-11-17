/**
 * The one real screenshot the website uses: the admin dashboard, captured from
 * the actual admin console running against DEMO data (never production data:
 * no real rider, vehicle, payment or business appears in it, and the map
 * positions are made up).
 *
 * `src` is relative to /public. Width/height are the file's real pixel size,
 * so the browser can reserve space and avoid layout shift.
 */
export interface Shot {
  id: string;
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export const SHOTS = {
  dashboard: {
    id: "dashboard",
    src: "/fleet/admin-dashboard.jpg",
    alt: "SwapNgo Fleet admin console: dashboard with revenue, fleet tracking, live map, battery stations, attendance and leave",
    caption: "Dashboard: revenue, fleet status, live map and what needs attention today",
    width: 1440,
    height: 1060,
  } satisfies Shot,
};

/** Flat list, dashboard first. The landing page hero uses the first entry. */
export const ADMIN_SHOTS: Shot[] = [SHOTS.dashboard];

export const RIDER_SHOTS: Shot[] = [];
