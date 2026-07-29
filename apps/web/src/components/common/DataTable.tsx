import type { ReactNode } from "react";
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
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}) {
  if (isLoading) return <LoadingSkeletonRows cols={columns.length} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto scrollbar-thin sm:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {columns.map((col) => (
                <th key={col.key} className={cn("px-4 py-3 font-medium", col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row) => (
              <tr
                key={row.id}
                className={cn("transition-smooth hover:bg-card-hover", onRowClick && "cursor-pointer")}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 align-middle", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="divide-y divide-border sm:hidden">
        {data.map((row) => (
          <div
            key={row.id}
            className={cn("space-y-2 px-4 py-4 transition-smooth", onRowClick && "cursor-pointer active:bg-card-hover")}
            onClick={() => onRowClick?.(row)}
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
        ))}
      </div>
    </>
  );
}
