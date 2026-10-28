import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevenueSummary, useRevenueTrend } from "@/hooks/useRevenue";
import { rangeForPreset } from "@/lib/period";
import { cn, formatCurrency } from "@/lib/utils";

const dayLabel = (bucket: string) => {
  const d = new Date(bucket);
  return Number.isNaN(d.getTime()) ? bucket : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function Chip({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-xl bg-card px-3.5 py-2.5 shadow-[0_6px_22px_rgba(16,24,40,0.10)] ring-1 ring-border/60">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", tone === "danger" && value > 0 && "text-destructive")}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

/**
 * This month's revenue day by day, with the headline figures it adds up to
 * floating above it: gross, refunds and the year to date. Everything comes from
 * the same revenue engine as the Revenue screen, which has the full breakdown.
 */
export function RevenueChartCard({ className }: { className?: string }) {
  const range = rangeForPreset("this_month");
  const { data, isLoading } = useRevenueSummary(range);
  const year = useRevenueSummary(rangeForPreset("this_year"));
  const trend = useRevenueTrend(range, "daily");
  const points = (trend.data ?? []).map((p) => ({ day: dayLabel(p.bucket), net: p.net }));

  return (
    <Card className={cn("flex flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Revenue</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">This month, net by day</p>
        </div>
        <Link to="/revenue" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Details <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading || !data ? (
        <Skeleton className="mt-4 h-4 w-48" />
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Chip label="Gross" value={data.gross} />
          <Chip label="Refunds" value={data.refunds} tone="danger" />
          <Chip label="This year" value={year.data?.net ?? 0} />
        </div>
      )}

      <div className="mt-3 min-h-[9.5rem] flex-1">
        {trend.isLoading ? (
          <Skeleton className="h-full min-h-[9.5rem] w-full" />
        ) : points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No revenue recorded this month yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={150}>
            <AreaChart data={points} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3CCB73" />
                  <stop offset="100%" stopColor="#17924A" />
                </linearGradient>
                <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 10 }} width={44} stroke="hsl(var(--muted-foreground))" tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), "Net revenue"]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
              />
              <Area type="monotone" dataKey="net" stroke="url(#revLine)" strokeWidth={2.4} fill="url(#revArea)" isAnimationActive />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
