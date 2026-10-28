import { Fragment, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { LoadingSkeletonRows } from "./LoadingSkeletonRows";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  header: string;
  key: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  /** Backend sort field this column maps to. Presence makes the header clickable (requires `sort`/`onSortChange` on the table). */
  sortKey?: string;
}

export interface DataTableSort {
  by: string;
  dir: "asc" | "desc";
}

/**
 * Generic responsive data table. On small screens it collapses to a stacked
 * card layout instead of a horizontally-scrolling table.
 */
export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  isError,
  onRetry,
  emptyTitle = "No records found",
  emptyDescription,
  onRowClick,
  onRowDoubleClick,
  expandedRowId,
  renderExpandedRow,
  sort,
  onSortChange,
  rowClassName,
  fill,
  noInnerScroll,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  /**
   * Opens a row only on a double click, for tables where a stray single click
   * (selecting text, reaching for a button) must not pop a dialog open. Text
   * selection is switched off on those rows, since a double click would
   * otherwise highlight a word in the cell.
   */
  onRowDoubleClick?: (row: T) => void;
  /** id of the row whose expanded panel (via renderExpandedRow) is open. */
  expandedRowId?: string | null;
  /** Renders inline below a row when its id matches expandedRowId. */
  renderExpandedRow?: (row: T) => ReactNode;
  /** Current sort state. Columns whose `sortKey` matches `sort.by` show a directional indicator. */
  sort?: DataTableSort;
  /** Called with a column's `sortKey` when its header is clicked. Toggling asc/desc is the caller's responsibility. */
  onSortChange?: (sortKey: string) => void;
  /** Optional per-row conditional classes (e.g. highlighting), applied to both the desktop row and the mobile stacked card. */
  rowClassName?: (row: T) => string | undefined;
  /**
   * Fill the height the parent gives it instead of the default viewport-based cap.
   * The parent must be a flex column with a bounded height (e.g.
   * `flex min-h-0 flex-1 flex-col`) so a footer such as <Pagination /> stays put
   * below the scrolling rows. Rows scroll inside the grid either way, header pinned.
   */
  fill?: boolean;
  /**
   * For a table that is one section of a longer page (e.g. a dashboard): every row is
   * shown and the page itself scrolls, so the pager follows the last row with no
   * inner scroll box or pinned header.
   */
  noInnerScroll?: boolean;
}) {
  if (isLoading) return <LoadingSkeletonRows cols={columns.length} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  // Rows always scroll inside the grid, never the whole page: `fill` takes the height its
  // parent gives it; otherwise the grid is capped to what is left of the viewport (with a
  // floor, so a short window scrolls the page instead of squashing the grid).
  return (
    <div
      className={cn(
        // noInnerScroll still scrolls sideways when the columns are wider than the card
        noInnerScroll ? "overflow-x-auto" : "overflow-auto",
        "scrollbar-thin",
        !noInnerScroll && (fill ? "min-h-0 flex-1" : "max-h-[max(20rem,calc(100vh-24rem))]"),
      )}
    >
      {/* Desktop / tablet table */}
      <div className="hidden sm:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {columns.map((col) => {
                const sortable = col.sortKey && onSortChange;
                const active = sortable && sort?.by === col.sortKey;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "bg-card px-4 py-3 font-medium",
                      // a border on the <tr> would scroll away from a sticky cell, so draw the line as an inset shadow
                      "shadow-[inset_0_-1px_0_hsl(var(--border))]",
                      !noInnerScroll && "sticky top-0 z-10",
                      col.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(col.sortKey!)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-smooth hover:text-foreground",
                          active && "text-foreground"
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <Fragment key={row.id}>
                <tr
                  className={cn(
                    "transition-smooth hover:bg-card-hover",
                    (onRowClick || onRowDoubleClick) && "cursor-pointer",
                    onRowDoubleClick && "select-none",
                  )}
                  onClick={() => onRowClick?.(row)}
                  onDoubleClick={() => onRowDoubleClick?.(row)}
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-3 align-middle", col.className, i === 0 && rowClassName?.(row))}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {renderExpandedRow && expandedRowId === row.id && (
                  <tr className="bg-card-hover/40">
                    <td colSpan={columns.length} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      {renderExpandedRow(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="divide-y divide-border sm:hidden">
        {data.map((row) => (
          <div key={row.id}>
            <div
              className={cn(
                "space-y-2 px-4 py-4 transition-smooth",
                (onRowClick || onRowDoubleClick) && "cursor-pointer active:bg-card-hover",
                onRowDoubleClick && "select-none",
                rowClassName?.(row),
              )}
              onClick={() => onRowClick?.(row)}
              onDoubleClick={() => onRowDoubleClick?.(row)}
            >
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">{col.header}</span>
                    <span className="text-right">{col.render(row)}</span>
                  </div>
                ))}
            </div>
            {renderExpandedRow && expandedRowId === row.id && (
              <div className="bg-card-hover/40 px-4 py-4" onClick={(e) => e.stopPropagation()}>
                {renderExpandedRow(row)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
