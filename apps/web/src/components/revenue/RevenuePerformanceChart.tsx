import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { CardContent, CardHeader } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueGranularity, RevenueTrendPoint } from "@/services/api/revenue";

const GRANULARITIES: { key: RevenueGranularity; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

interface Merged {
  bucket: string;
  current: number;
  previous: number | null;
}

/** Zips the two series by position — the ranges are equal-length by construction. */
function merge(cur: RevenueTrendPoint[], prev: RevenueTrendPoint[]): Merged[] {
  return cur.map((p, i) => ({
    bucket: p.bucket,
    current: p.gross,
    previous: prev[i]?.gross ?? null,
  }));
}

function ChartTooltip({ active, payload, label, compareLabel }: {
  active?: boolean;
  payload?: { payload: Merged }[];
  label?: string;
  compareLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const diff = d.previous == null ? null : d.current - d.previous;
  const growth = d.previous ? (diff! / d.previous) * 100 : null;
  return (
    <div className="rounded-[10px] border border-border bg-card p-2.5 text-xs shadow-card">
      <p className="mb-1 font-medium">{label}</p>
      <p className="flex justify-between gap-6">
        <span className="text-muted-foreground">Current</span>
        <span className="tabular-nums font-medium">{formatCurrency(d.current)}</span>
      </p>
      {d.previous != null && (
        <>
          <p className="flex justify-between gap-6">
            <span className="text-muted-foreground">Previous</span>
            <span className="tabular-nums">{formatCurrency(d.previous)}</span>
          </p>
          <p className="mt-1 flex justify-between gap-6 border-t border-border pt-1">
            <span className="text-muted-foreground">Difference</span>
            <span className={cn("tabular-nums font-medium", diff! >= 0 ? "text-primary" : "text-destructive")}>
              {diff! >= 0 ? "+" : "−"}{formatCurrency(Math.abs(diff!))}
            </span>
          </p>
          {growth != null && (
            <p className="flex justify-between gap-6">
              <span className="text-muted-foreground">Growth</span>
              <span className={cn("tabular-nums font-medium", growth >= 0 ? "text-primary" : "text-destructive")}>
                {growth >= 0 ? "+" : "−"}{Math.abs(Math.round(growth * 10) / 10)}%
              </span>
            </p>
          )}
        </>
      )}
      <p className="mt-1 text-[0.625rem] text-muted-foreground">Previous = {compareLabel.replace(/^vs /, "")}</p>
    </div>
  );
}

/**
 * The hero analytics card: gross revenue for the selected period as a headline,
 * the period-over-period delta, and an area chart overlaying the current period
 * against the comparison period.
 */
export function RevenuePerformanceChart({
  current,
  previous,
  total,
  deltaPct,
  compareLabel,
  granularity,
  onGranularityChange,
  isLoading,
}: {
  current: RevenueTrendPoint[] | undefined;
  previous: RevenueTrendPoint[] | undefined;
  total: number | undefined;
  deltaPct?: number | null;
  compareLabel: string;
  granularity: RevenueGranularity;
  onGranularityChange: (g: RevenueGranularity) => void;
  isLoading: boolean;
}) {
  const data = merge(current ?? [], previous ?? []);
  const up = deltaPct != null && deltaPct >= 0;

  return (
    <MotionCard>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-5 pb-2">
        <div>
          <p className="text-sm font-semibold">Revenue Performance</p>
          {isLoading || total == null ? (
            <Skeleton className="mt-1.5 h-8 w-40" />
          ) : (
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight">{formatCurrency(total)}</span>
              {deltaPct != null && (
                <span className={cn("flex items-center gap-0.5 text-xs font-semibold", up ? "text-primary" : "text-destructive")}>
                  {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {Math.abs(deltaPct)}%
                </span>
              )}
              <span className="text-xs text-muted-foreground">{compareLabel}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => onGranularityChange(g.key)}
              className={cn(
                "rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-smooth",
                granularity === g.key ? "bg-card text-primary shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-1">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <div className="py-10"><EmptyState title="No revenue in this period" /></div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="perf-current" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 5" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  stroke="hsl(var(--muted-foreground))" minTickGap={28} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={46}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip content={<ChartTooltip compareLabel={compareLabel} />} />
                <Area type="monotone" dataKey="previous" name="Previous" stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} isAnimationActive />
                <Area type="monotone" dataKey="current" name="Current" stroke="hsl(var(--primary))"
                  strokeWidth={2.5} fill="url(#perf-current)" dot={false} isAnimationActive />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 flex gap-4 text-[0.6875rem] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-primary" /> Current period
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full border-t border-dashed border-muted-foreground" /> {compareLabel.replace(/^vs /, "")}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </MotionCard>
  );
}
