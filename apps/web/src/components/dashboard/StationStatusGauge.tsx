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
export function StationStatusGauge({ summary, isLoading }: { summary?: BatteryStationSummary; isLoading?: boolean }) {
  if (isLoading || !summary) return <Skeleton className="h-48 w-full" />;

  const data = SEGMENTS.map((s) => ({ ...s, value: summary[s.key] as number }));
  const hasData = summary.totalStations > 0;

  return (
    <div className="flex h-48 items-center gap-4">
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
          <span className="text-xl font-semibold tracking-tight">{summary.totalStations}</span>
          <span className="text-[11px] text-muted-foreground">Total Stations</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className={cn("h-2 w-2 rounded-full", d.dot)} />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
