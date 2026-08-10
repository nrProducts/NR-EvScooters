import { BatteryCharging, MapPin, TriangleAlert, Zap } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { BatteryStationSummary } from "@/types/batteryStation";

export function StationSummaryCards({
  summary,
  isLoading,
}: {
  summary?: BatteryStationSummary;
  isLoading?: boolean;
}) {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total stations" value={summary.totalStations} icon={MapPin} />
      <StatCard label="Working" value={summary.workingStations} icon={Zap} tone="success" />
      <StatCard
        label="Maintenance / not working"
        value={summary.attentionStations}
        icon={TriangleAlert}
        tone="warning"
      />
      <StatCard label="Total batteries" value={summary.totalBatteries} icon={BatteryCharging} tone="info" />
    </div>
  );
}
