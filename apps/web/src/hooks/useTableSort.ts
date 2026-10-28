import { useCallback } from "react";
import type { DataTableSort } from "@/components/common/DataTable";
import { useSessionState } from "@/hooks/useSessionState";

/**
 * Shared sort-state for DataTable-backed grids. Clicking the already-active
 * column toggles its direction; clicking a different column switches to it
 * starting ascending. Defaults (e.g. created_at/desc) are set by the caller.
 * Pass `storageKey` to keep the sort when the admin leaves the screen and
 * comes back (see useSessionState).
 */
export function useTableSort(defaultBy: string, defaultDir: "asc" | "desc" = "desc", storageKey?: string) {
  const [sort, setSort] = useSessionState<DataTableSort>(storageKey, { by: defaultBy, dir: defaultDir });

  const onSortChange = useCallback((key: string) => {
    setSort((prev) => (prev.by === key ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" } : { by: key, dir: "asc" }));
  }, []);

  return { sort, onSortChange, setSort };
}
