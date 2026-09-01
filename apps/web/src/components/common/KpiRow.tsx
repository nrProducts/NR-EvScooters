import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The standard KPI/stat strip: a responsive grid of `StatCard`s with equal
 * spacing and (via StatCard's own min-height) equal card height. Pass 2–6
 * `<StatCard>` children.
 *
 * `cols` caps the widest breakpoint's column count so a 4-KPI row doesn't
 * stretch to 6. Defaults to "fit as many as given, up to 6".
 */
const COLS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-3 lg:grid-cols-6",
};

export function KpiRow({
  children,
  cols = 6,
  className,
}: {
  children: ReactNode;
  cols?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", COLS[cols], className)}>{children}</div>
  );
}
