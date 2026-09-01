import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueByTypeRow } from "@/services/api/revenue";

/**
 * The analytics-row right column: the mix of what makes up Gross Revenue, each
 * with a share bar. Discounts render negative / red.
 */
export function RevenueSourcesCard({
  rows,
  isLoading,
}: {
  rows: RevenueByTypeRow[] | undefined;
  isLoading: boolean;
}) {
  const sources = (rows ?? []).filter((r) => r.type !== "gross");
  const maxAbs = Math.max(1, ...sources.map((r) => Math.abs(r.amount)));

  return (
    <MotionCard className="h-full">
      <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Revenue Sources</CardTitle></CardHeader>
      <CardContent className="space-y-3 p-4 pt-1">
        {isLoading ? (
          <div className="space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : sources.length === 0 ? (
          <div className="py-6"><EmptyState title="No revenue in this period" /></div>
        ) : (
          sources.map((r) => {
            const negative = r.amount < 0;
            return (
              <div key={r.type} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={cn("font-medium tabular-nums", negative ? "text-destructive" : "text-foreground")}>
                    {negative ? `−${formatCurrency(Math.abs(r.amount))}` : formatCurrency(r.amount)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", negative ? "bg-destructive/70" : "bg-primary")}
                    style={{ width: `${(Math.abs(r.amount) / maxAbs) * 100}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </MotionCard>
  );
}
