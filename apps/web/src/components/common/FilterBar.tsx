import { useState } from "react";
import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The filter row that sits at the top of a list `Card`, above its `DataTable` —
 * a bordered strip holding a search input plus dropdown filters. This is the
 * block that `BookingListPage` and ~12 other screens build by hand; use this so
 * they stay identical.
 *
 * `search` renders inline always (left). `filters` render inline on `sm+` and
 * collapse behind a "Filters" button + slide-over sheet on mobile (spec §5).
 * `trailing` is right-aligned inline content (a policy note, a count) that is
 * never collapsed.
 */
export function FilterBar({
  search,
  filters,
  trailing,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {search}
        {filters && <div className="hidden flex-wrap items-center gap-2 sm:flex">{filters}</div>}
        {filters && (
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:hidden"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </Button>
        )}
      </div>
      {trailing}

      {filters && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-3 [&_button]:w-full [&>*]:w-full">{filters}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
