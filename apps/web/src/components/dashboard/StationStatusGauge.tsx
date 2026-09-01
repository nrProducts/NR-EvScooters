import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { BatteryStationSummary } from "@/types/batteryStation";

const SEGMENTS: { key: keyof BatteryStationSummary; label: string; color: string }[] = [
  { key: "workingStations", label: "Working", color: "hsl(var(--success))" },
  { key: "attentionStations", label: "Needs attention", color: "hsl(var(--info))" },
  { key: "maintenanceStations", label: "Maintenance", color: "hsl(var(--warning))" },
  { key: "notWorkingStations", label: "Not working", color: "hsl(var(--destructive))" },
];

/**
 * Battery-station network health as a donut with the total in the middle and
 * a legend of counts + shares. Real numbers from
 * GET /admin/battery-stations/summary.
 */
export function StationStatusGauge({
  summary,
  isLoading,
  compact = false,
}: {
  summary?: BatteryStationSummary;
  isLoading?: boolean;
  compact?: boolean;
}) {
  if (isLoading || !summary) {
    return <Skeleton className={cn("w-full", compact ? "h-40" : "h-52")} />;
  }

  const total = summary.totalStations;
  const rows = SEGMENTS.map((s) => ({ ...s, value: (summary[s.key] as number) ?? 0 }));
  const hasData = total > 0;
  const chartData = hasData ? rows.filter((r) => r.value > 0) : [{ label: "No stations", value: 1, color: "hsl(var(--muted))" }];

  const ring = compact ? "h-28 w-28" : "h-40 w-40";

  return (
    <div className={cn("flex", compact ? "flex-row items-center gap-4" : "flex-col items-center gap-4")}>
      <div className={cn("relative shrink-0", ring)}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={hasData && chartData.length > 1 ? 3 : 0}
              cornerRadius={4}
              stroke="none"
            >
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            {hasData && (
              <Tooltip
                formatter={(v: number, n) => [`${v} station${v === 1 ? "" : "s"}`, n]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-semibold leading-none tracking-tight", compact ? "text-lg" : "text-2xl")}>{total}</span>
          <span className="mt-0.5 text-[0.625rem] uppercase tracking-wide text-muted-foreground">Stations</span>
        </div>
      </div>

      <ul className={cn("w-full", compact ? "space-y-1.5" : "grid grid-cols-2 gap-x-4 gap-y-1.5")}>
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <li key={r.label} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
              <span className="flex-1 truncate text-muted-foreground">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.value}</span>
              <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
