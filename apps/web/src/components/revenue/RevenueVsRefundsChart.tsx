import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueTrendPoint } from "@/services/api/revenue";

/**
 * Gross vs refunds vs net per bucket — the "how much did we keep?" view.
 * Refunds are drawn in muted red; net in brand green.
 */
export function RevenueVsRefundsChart({
  data,
  isLoading,
}: {
  data: RevenueTrendPoint[] | undefined;
  isLoading: boolean;
}) {
  const rows = data ?? [];
  const hasRefunds = rows.some((r) => r.refunds > 0);

  return (
    <MotionCard className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-sm">Revenue vs Refunds</CardTitle>
        <div className="flex gap-3 text-[0.6875rem] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/35" /> Gross</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" /> Net</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-destructive/70" /> Refunds</span>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <div className="py-8"><EmptyState title="No revenue in this period" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }} barGap={2}>
              <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                stroke="hsl(var(--muted-foreground))" minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                formatter={(v: number, name) => [formatCurrency(v), name]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
              />
              <Bar dataKey="gross" name="Gross" fill="hsl(var(--primary))" fillOpacity={0.3} radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Net" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              {hasRefunds && (
                <Bar dataKey="refunds" name="Refunds" radius={[4, 4, 0, 0]}>
                  {rows.map((_, i) => <Cell key={i} fill="hsl(var(--destructive))" fillOpacity={0.7} />)}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
        {!isLoading && rows.length > 0 && !hasRefunds && (
          <p className={cn("mt-1 text-[0.6875rem] text-muted-foreground")}>
            No refunds in this period — net equals gross.
          </p>
        )}
      </CardContent>
    </MotionCard>
  );
}
