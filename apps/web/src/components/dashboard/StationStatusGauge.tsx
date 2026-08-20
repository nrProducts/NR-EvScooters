import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { BatteryStationSummary } from "@/types/batteryStation";

const SEGMENTS: { key: keyof BatteryStationSummary; label: string; color: string; dot: string }[] = [
  { key: "workingStations", label: "Working", color: "hsl(var(--success))", dot: "bg-success" },
  { key: "maintenanceStations", label: "Maintenance", color: "hsl(var(--warning))", dot: "bg-warning" },
  { key: "notWorkingStations", label: "Not working", color: "hsl(var(--destructive))", dot: "bg-destructive" },
];

/** Donut + legend for the battery station network's health — real counts from GET /admin/battery-stations/summary. */
export function StationStatusGauge({
  summary,
  isLoading,
  compact = false,
}: {
  summary?: BatteryStationSummary;
  isLoading?: boolean;
  compact?: boolean;
}) {
  const heightClass = compact ? "h-24" : "h-48";
  if (isLoading || !summary) return <Skeleton className={cn("w-full", heightClass)} />;

  const data = SEGMENTS.map((s) => ({ ...s, value: summary[s.key] as number }));
  const hasData = summary.totalStations > 0;

  return (
    <div className={cn("flex items-center", compact ? "gap-3" : "gap-4", heightClass)}>
      <div className="relative h-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={hasData ? data : [{ ...SEGMENTS[0], value: 1 }]}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {(hasData ? data : [{ ...SEGMENTS[0], value: 1 }]).map((d, i) => (
                <Cell key={i} fill={hasData ? d.color : "hsl(var(--muted))"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-xl")}>{summary.totalStations}</span>
          {!compact && <span className="text-[0.6875rem] text-muted-foreground">Total Stations</span>}
        </div>
      </div>
      <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
        {data.map((d) => (
          <div key={d.label} className={cn("flex items-center gap-2", compact ? "text-[0.6875rem]" : "text-xs")}>
            <span className={cn("h-2 w-2 rounded-full", d.dot)} />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
