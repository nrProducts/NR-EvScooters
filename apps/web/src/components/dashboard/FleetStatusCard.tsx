import { motion } from "framer-motion";
import { Gauge } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "@/types";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  assigned: "Assigned",
  maintenance: "Maintenance",
  retired: "Retired",
};

const FLEET_BAR_COLOR: Record<VehicleStatus, string> = {
  available: "bg-success",
  reserved: "bg-info",
  assigned: "bg-primary",
  maintenance: "bg-warning",
  retired: "bg-muted-foreground/50",
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
  compact = false,
}: {
  byStatus: Record<VehicleStatus, number> | undefined;
  total: number;
  isLoading: boolean;
  compact?: boolean;
}) {
  if (compact) {
    const statuses = byStatus ? (Object.keys(byStatus) as VehicleStatus[]) : [];
    return (
      <MotionCard>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-3 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <CardTitle className="text-xs">Fleet Status</CardTitle>
          </div>
          <span className="text-[0.6875rem] font-semibold text-muted-foreground">{total} total</span>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-1">
          {isLoading || !byStatus ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {statuses.map((status) => {
                  const pct = total > 0 ? (byStatus[status] / total) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <motion.div
                      key={status}
                      className={cn("h-full", FLEET_BAR_COLOR[status])}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[0.6875rem]">
                {statuses.map((status) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FLEET_BAR_COLOR[status])} />
                    <span className="truncate text-muted-foreground">{VEHICLE_STATUS_LABEL[status]}</span>
                    <span className="ml-auto font-medium tabular-nums">{byStatus[status]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </MotionCard>
    );
  }

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
