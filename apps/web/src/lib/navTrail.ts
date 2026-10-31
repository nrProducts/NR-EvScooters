import { matchPath as matchRoute } from "react-router-dom";
import { matchPath as matchNavItem } from "@/routes/roleConfig";

/**
 * Breadcrumbs that follow where the admin actually came from, not a fixed
 * parent.
 *
 * A user record opened from Rental Operations used to send its back arrow to
 * the Users list, a screen the admin had never been on, and their tab and
 * filters on Rental Operations were lost. Now every page visited is recorded
 * against its slot in the browser's history (React Router keeps that slot as
 * `idx` in `history.state`). The trail for the current page is found by walking
 * back from the current slot: detail pages are added, and the walk stops at the
 * first section page (anything in the sidebar). So the crumbs are a run of real
 * history entries, and stepping back to one is `navigate(-n)`, which brings that
 * page back exactly as it was left.
 *
 * A detail page opened cold (a pasted link, a new tab, a notification) has no
 * history behind it. Its trail starts at the section the route belongs to,
 * reached by an ordinary navigation.
 */

/** A page recorded at one slot of the browser history. */
export interface TrailEntry {
  idx: number;
  /** React Router's location.key: tells a revisited slot from a new page in it. */
  key: string;
  pathname: string;
  search: string;
}

/**
 * Pages that belong under a section rather than being one. `parent` is the
 * section a cold-opened page falls back to; `label` names the page until it
 * gives its own (a user's name, a plate) through useBreadcrumbLabel.
 */
const DETAIL_ROUTES: { pattern: string; parent: string; label: string }[] = [
  { pattern: "/users/:id", parent: "/users", label: "User" },
  { pattern: "/vehicles/:id", parent: "/vehicles", label: "Vehicle" },
  { pattern: "/bookings/returns/:rentalId", parent: "/bookings", label: "Return review" },
  { pattern: "/settings/staff-access/:userId/permissions", parent: "/settings?tab=staff-access", label: "Permissions" },
  { pattern: "/settings/notification-manager", parent: "/settings", label: "Notification Manager" },
];

function detailRoute(pathname: string) {
  return DETAIL_ROUTES.find((r) => matchRoute(r.pattern, pathname));
}

/** The sidebar label of a section page; undefined for pages outside the console (login, 404). */
function sectionLabel(pathname: string): string | undefined {
  return matchNavItem(pathname)?.label;
}

export interface Crumb {
  label: string;
  /** Where the crumb points, for the link's href (open in new tab, copy link). */
  to: string;
  /**
   * History steps back to this crumb (negative), when it is a real entry
   * behind the current one. Null for a fallback section reached by a fresh
   * navigation.
   */
  delta: number | null;
}

/** Longer trails keep their first crumb and the last few; the middle collapses. */
export const MAX_VISIBLE_CRUMBS = 4;
/** Walks stop here, whatever the history holds, so a long chain of cross-links can't grow the trail without bound. */
const MAX_WALK = 12;

/**
 * The crumbs for the page at `current`, outermost first, current page last.
 * A single crumb means "this is a section page"; callers show nothing then.
 */
export function buildTrail(
  entries: Record<number, TrailEntry>,
  labels: Record<string, string>,
  current: TrailEntry,
): Crumb[] {
  const labelOf = (e: TrailEntry) =>
    labels[e.key] ?? detailRoute(e.pathname)?.label ?? sectionLabel(e.pathname) ?? e.pathname;
  const crumbOf = (e: TrailEntry): Crumb => ({
    label: labelOf(e),
    to: e.pathname + e.search,
    delta: e.idx === current.idx ? 0 : e.idx - current.idx,
  });

  const trail: Crumb[] = [crumbOf(current)];
  if (!detailRoute(current.pathname)) return trail;

  let reachedSection = false;
  for (let i = current.idx - 1; i >= 0 && trail.length < MAX_WALK; i--) {
    const e = entries[i];
    // A gap means a page this tracker never saw (outside the console, or
    // before it loaded): what came before it is unknown, so stop here.
    if (!e) break;
    if (detailRoute(e.pathname)) {
      trail.unshift(crumbOf(e));
      continue;
    }
    // A sidebar page: the trail starts here. Anything else (login, 404) is
    // not a place to send the admin back to; the section fallback below
    // stands in for it.
    if (sectionLabel(e.pathname)) {
      trail.unshift(crumbOf(e));
      reachedSection = true;
    }
    break;
  }

  if (!reachedSection) {
    const parent = detailRoute(trail[0].to.split("?")[0])?.parent;
    if (parent) trail.unshift({ label: sectionLabel(parent.split("?")[0]) ?? parent, to: parent, delta: null });
  }
  return trail;
}

/** React Router's history slot for the current page. 0 if the state is missing (it sets one on load). */
export function currentHistoryIdx(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : 0;
}
