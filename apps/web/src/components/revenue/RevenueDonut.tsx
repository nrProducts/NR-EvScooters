import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueByTypeRow } from "@/services/api/revenue";

/**
 * Premium revenue-breakdown donut: gross total in the middle, one slice per
 * positive revenue category, and a legend with amounts + share. Discounts are
 * a deduction, not a slice — shown under the legend in muted red.
 */

// Emerald-anchored, still distinguishable.
const PALETTE = ["#10B981", "#34D399", "#6EE7B7", "#3B82F6", "#F59E0B", "#8B5CF6", "#94A3B8"];

export function RevenueDonut({
  rows,
  isLoading,
}: {
  rows: RevenueByTypeRow[] | undefined;
  isLoading: boolean;
}) {
  const all = (rows ?? []).filter((r) => r.type !== "gross");
  const slices = all.filter((r) => r.amount > 0);
  const discounts = all.filter((r) => r.amount < 0);
  const gross = rows?.find((r) => r.type === "gross")?.amount ?? slices.reduce((s, r) => s + r.amount, 0);

  return (
    <MotionCard className="h-full">
      <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Revenue Breakdown</CardTitle></CardHeader>
      <CardContent className="p-4 pt-1">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : slices.length === 0 ? (
          <div className="py-8"><EmptyState title="No revenue in this period" /></div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="relative h-44 w-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="amount"
                    nameKey="label"
                    innerRadius="66%"
                    outerRadius="100%"
                    paddingAngle={2}
                    stroke="none"
                    isAnimationActive
                  >
                    {slices.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n) => [formatCurrency(v), n]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">Gross</span>
                <span className="text-lg font-semibold tracking-tight">{formatCurrency(gross)}</span>
              </div>
            </div>

            <ul className="w-full space-y-1.5">
              {slices.map((r, i) => (
                <li key={r.type} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1 truncate text-muted-foreground">{r.label}</span>
                  <span className="tabular-nums font-medium text-foreground">{formatCurrency(r.amount)}</span>
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{r.pct}%</span>
                </li>
              ))}
              {discounts.map((r) => (
                <li key={r.type} className="flex items-center gap-2 border-t border-border pt-1.5 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-destructive/60" />
                  <span className="flex-1 truncate text-muted-foreground">{r.label}</span>
                  <span className={cn("tabular-nums font-medium text-destructive")}>−{formatCurrency(Math.abs(r.amount))}</span>
                  <span className="w-10 shrink-0" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </MotionCard>
  );
}
