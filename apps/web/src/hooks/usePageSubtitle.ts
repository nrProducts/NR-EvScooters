import { useEffect } from "react";
import type { ReactNode } from "react";
import { usePageHeaderStore } from "@/store/pageHeaderStore";

/**
 * Publishes this page's subtitle up to the header bar, next to the page
 * title (see Header.tsx / roleConfig.ts's matchPath). Clears itself on
 * unmount so a page never leaks its subtitle onto the next route.
 */
export function usePageSubtitle(subtitle: ReactNode): void {
  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);
  // Runs after every render (no deps — `subtitle` is often a fresh ReactNode
  // each time, e.g. `{data?.total} riders`) but WITHOUT a cleanup, so a
  // background refetch never flashes the subtitle to blank in between.
  useEffect(() => {
    setSubtitle(subtitle);
  });
  // Cleanup lives in its own mount-only effect so it fires exactly once, on
  // unmount — when navigating away, not on every re-render.
  useEffect(() => () => setSubtitle(null), [setSubtitle]);
}
