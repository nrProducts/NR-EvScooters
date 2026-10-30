import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { buildTrail, currentHistoryIdx, type Crumb } from "@/lib/navTrail";
import { useNavTrailStore } from "@/store/navTrailStore";

/**
 * Records each page in the trail store. Mounted once, above every route
 * (AppRoutes), so pages outside the console still claim their history slot
 * and a stale entry can't leak into a later trail.
 */
export function useNavTrailTracker(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const record = useNavTrailStore((s) => s.record);
  useEffect(() => {
    record(
      { idx: currentHistoryIdx(), key: location.key, pathname: location.pathname, search: location.search },
      navigationType === "PUSH",
    );
    // location.key changes on every navigation, including search-only ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
}

/** The current page's breadcrumbs, outermost first. One crumb means a section page. */
export function useNavTrail(): Crumb[] {
  const location = useLocation();
  const entries = useNavTrailStore((s) => s.entries);
  const labels = useNavTrailStore((s) => s.labels);
  return useMemo(
    () =>
      buildTrail(entries, labels, {
        idx: currentHistoryIdx(),
        key: location.key,
        pathname: location.pathname,
        search: location.search,
      }),
    [entries, labels, location.key, location.pathname, location.search],
  );
}

/**
 * Names the current page in the breadcrumbs (a rider's name, a plate) once it
 * has loaded. Until then it shows the route's generic label.
 */
export function useBreadcrumbLabel(label: string | null | undefined): void {
  const { key } = useLocation();
  const setLabel = useNavTrailStore((s) => s.setLabel);
  useEffect(() => {
    if (label) setLabel(key, label);
  }, [key, label, setLabel]);
}

/** Goes to a crumb: back through history when it is a real entry, so the page returns as it was left. */
export function useGoToCrumb() {
  const navigate = useNavigate();
  return useCallback(
    (crumb: Crumb) => {
      if (crumb.delta) navigate(crumb.delta);
      else if (crumb.delta === null) navigate(crumb.to);
    },
    [navigate],
  );
}

/**
 * What a detail page's back arrow does: return to the previous crumb, the page
 * the admin actually came from. A cold-opened page goes to its section instead.
 */
export function useGoBack(): () => void {
  const trail = useNavTrail();
  const goToCrumb = useGoToCrumb();
  const parent = trail[trail.length - 2];
  return useCallback(() => {
    if (parent) goToCrumb(parent);
  }, [parent, goToCrumb]);
}
