import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, PiggyBank } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevenueSummary, useRevenueTrend } from "@/hooks/useRevenue";
import { rangeForPreset, previousRange } from "@/lib/period";
import { cn, formatCurrency } from "@/lib/utils";

/** A smooth-ish line through the points, scaled to fill a 64×32 box. Nothing at all under two points. */
function Spark({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = 60 / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(2 + i * step).toFixed(1)} ${(28 - ((p - min) / span) * 24).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 64 32" className={cn("h-8 w-16 shrink-0", className)} fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The last few values as rounded bars, the tallest filling the box. */
function MiniBars({ points }: { points: number[] }) {
  const last = points.slice(-5);
  if (last.length === 0) return null;
  const max = Math.max(...last, 1);
  return (
    <div className="flex h-11 shrink-0 items-end gap-1.5" aria-hidden="true">
      {last.map((p, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full", i === last.length - 1 ? "bg-primary/35" : "bg-primary")}
          style={{ height: `${Math.max(12, (p / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Tile({
  label, value, lead, trail, to, highlight,
}: {
  label: string;
  value: string;
  lead?: ReactNode;
  trail?: ReactNode;
  to?: string;
  highlight?: boolean;
}) {
  const body = (
    <Card
      className={cn(
        "flex min-h-[5.5rem] items-center justify-between gap-3 px-5 py-4",
        highlight && "border-0 bg-gradient-to-br from-[#3CCB73] to-[#17924A] text-white shadow-[0_10px_28px_rgba(23,146,74,0.28)]",
        to && "transition-transform hover:-translate-y-0.5",
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        {lead}
        <div className="min-w-0">
          <p className={cn("truncate text-[0.8125rem] font-medium", highlight ? "text-white/85" : "text-muted-foreground")}>{label}</p>
          <p className="mt-0.5 truncate text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        </div>
      </div>
      {trail}
    </Card>
  );
  return to ? <Link to={to} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

/**
 * The dashboard's headline money row: this week, this month, the deposits taken
 * this month, and net revenue (the one highlighted card). Same figures, from the
 * same revenue engine, as the Revenue screen; the small charts are the month's
 * daily net revenue.
 */
export function DashboardKpiRow() {
  const range = rangeForPreset("this_month");
  const { data, isLoading } = useRevenueSummary(range, previousRange(range));
  const week = useRevenueSummary(rangeForPreset("this_week"));
  const trend = useRevenueTrend(range, "daily");
  const daily = (trend.data ?? []).map((p) => p.net);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[5.5rem] rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Weekly revenue" value={formatCurrency(week.data?.net ?? 0)} to="/revenue" trail={<MiniBars points={daily} />} />
      <Tile
        label="Monthly revenue"
        value={formatCurrency(data.net)}
        to="/revenue"
        lead={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><CalendarRange className="h-5 w-5" /></span>}
        trail={<Spark points={daily} className="text-muted-foreground/60" />}
      />
      <Tile
        label="Deposits collected"
        value={formatCurrency(data.deposits.collected)}
        to="/deposits"
        lead={<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><PiggyBank className="h-5 w-5" /></span>}
      />
      <Tile label="Net revenue" value={formatCurrency(data.net)} to="/revenue" highlight trail={<Spark points={daily} className="text-white/90" />} />
    </div>
  );
}
