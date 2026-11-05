import { useCallback, useRef, useState } from "react";

/** The rows-per-page choices offered under every list. */
export const PAGE_SIZE_OPTIONS = [5, 10, 15, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

const STORAGE_KEY = "admin.pageSize";

function readStored(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

/**
 * Rows per page for a list, defaulting to 10. The admin's pick is remembered
 * (this browser only) and shared by every list, so choosing 50 once sticks.
 *
 * Changing the size re-points the page so the first row the admin was looking
 * at stays on screen (row 21 on page 3 of 10 → page 2 of 15).
 */
export function usePageSize(page: number, setPage: (p: number) => void) {
  const [pageSize, setPageSizeState] = useState(readStored);
  const latest = useRef({ page, pageSize });
  latest.current = { page, pageSize };

  const setPageSize = useCallback((next: number) => {
    const { page: p, pageSize: old } = latest.current;
    if (next === old) return;
    const nextPage = Math.floor(((p - 1) * old) / next) + 1;
    if (nextPage !== p) setPage(nextPage);
    setPageSizeState(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* storage blocked — the choice just isn't remembered */ }
  }, [setPage]);

  return { pageSize, setPageSize };
}
