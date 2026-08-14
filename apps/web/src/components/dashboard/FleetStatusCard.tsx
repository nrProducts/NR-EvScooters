import { motion } from "framer-motion";
import { Gauge } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "@/types";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  booked: "Booked",
  assigned: "Assigned",
  maintenance: "Maintenance",
  scrap: "Scrapped",
};

const FLEET_BAR_COLOR: Record<VehicleStatus, string> = {
  available: "bg-success",
  booked: "bg-info",
  assigned: "bg-primary",
  maintenance: "bg-warning",
  scrap: "bg-muted-foreground/50",
};

function FleetStatusRow({ status, count, total }: { status: VehicleStatus; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{VEHICLE_STATUS_LABEL[status]}</span>
        <span className="text-muted-foreground">{count} · {pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", FLEET_BAR_COLOR[status])}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

/**
 * Shared by the admin and staff dashboards — staff only ever render this when
 * they hold vehicles.view (see StaffDashboardPage.tsx), since /reports/summary
 * is otherwise the same "here's the whole fleet" payload for everyone who can
 * reach the dashboard at all.
 */
export function FleetStatusCard({
  byStatus,
  total,
  isLoading,
}: {
  byStatus: Record<VehicleStatus, number> | undefined;
  total: number;
  isLoading: boolean;
}) {
  return (
    <MotionCard>
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-4 pb-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm">Fleet Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        {isLoading || !byStatus ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          (Object.keys(byStatus) as VehicleStatus[]).map((status) => (
            <FleetStatusRow key={status} status={status} count={byStatus[status]} total={total} />
          ))
        )}
      </CardContent>
    </MotionCard>
  );
}
