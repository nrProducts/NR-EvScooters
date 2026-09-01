import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueTrendPoint } from "@/services/api/revenue";

const QUICK = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "6m", label: "6M", days: 180 },
  { key: "1y", label: "1Y", days: 365 },
] as const;

const SERIES = [
  { key: "gross", label: "Gross Revenue", color: "hsl(var(--primary))" },
  { key: "net", label: "Net Revenue", color: "hsl(var(--success))" },
  { key: "refunds", label: "Refunds", color: "hsl(var(--destructive))" },
] as const;

export function RevenueTrendChart({
  data,
  isLoading,
  activeQuick,
  onQuickRange,
}: {
  data: RevenueTrendPoint[] | undefined;
  isLoading: boolean;
  activeQuick: string | null;
  onQuickRange: (days: number, key: string) => void;
}) {
  return (
    <MotionCard>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-4 pb-2">
        <CardTitle className="text-sm">Revenue Trend</CardTitle>
        <div className="flex gap-1 rounded-md bg-muted p-0.5">
          {QUICK.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => onQuickRange(q.days, q.key)}
              className={cn(
                "rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-smooth",
                activeQuick === q.key ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data || data.length === 0 ? (
          <div className="py-8"><EmptyState title="No revenue in this period" /></div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`rev-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  formatter={(v: number, name) => [formatCurrency(v), name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
                />
                {SERIES.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#rev-${s.key})`}
                    dot={false}
                    isAnimationActive
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </MotionCard>
  );
}
