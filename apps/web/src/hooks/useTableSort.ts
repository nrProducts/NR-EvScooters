import { useCallback, useState } from "react";
import type { DataTableSort } from "@/components/common/DataTable";

/**
 * Shared sort-state for DataTable-backed grids. Clicking the already-active
 * column toggles its direction; clicking a different column switches to it
 * starting ascending. Defaults (e.g. created_at/desc) are set by the caller.
 */
export function useTableSort(defaultBy: string, defaultDir: "asc" | "desc" = "desc") {
  const [sort, setSort] = useState<DataTableSort>({ by: defaultBy, dir: defaultDir });

  const onSortChange = useCallback((key: string) => {
    setSort((prev) => (prev.by === key ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" } : { by: key, dir: "asc" }));
  }, []);

  return { sort, onSortChange, setSort };
}
