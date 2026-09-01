import { CalendarCheck, LifeBuoy, ShieldCheck, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartCard } from "@/components/common/ChartCard";
import { FleetStatusCard } from "@/components/dashboard/FleetStatusCard";
import { StationNetworkMap } from "@/components/dashboard/StationNetworkMap";
import { StationStatusGauge } from "@/components/dashboard/StationStatusGauge";
import { useAuth } from "@/hooks/useAuth";
import { usePickupQueue } from "@/hooks/useBookings";
import { useSupportQueue } from "@/hooks/useSupport";
import { useKycQueue } from "@/hooks/useKyc";
import { useReportsSummary } from "@/hooks/useReports";
import { useAdminStations, useStationSummary } from "@/hooks/useBatteryStations";
import { hasAction } from "@/lib/permissions";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatDate, greetingForHour } from "@/lib/utils";

export default function StaffDashboardPage() {
  const { user } = useAuth();

  const canViewBookings = hasAction(user, "bookings", "view");
  const canViewSupport = hasAction(user, "support", "view");
  const canViewKyc = hasAction(user, "kyc", "view");
  const canViewVehicles = hasAction(user, "vehicles", "view");
  const canViewMaintenance = hasAction(user, "maintenance", "view");
  const canViewDashboard = hasAction(user, "dashboard", "view");
  const canViewStations = hasAction(user, "battery_stations", "view");

  const { data: pickups, isLoading: pickupsLoading } = usePickupQueue({ pageSize: 5 }, { enabled: canViewBookings });
  const { data: openTickets, isLoading: ticketsLoading } = useSupportQueue({ status: "open", pageSize: 1 }, { enabled: canViewSupport });
  const { data: kycQueue, isLoading: kycLoading } = useKycQueue({ status: "pending", pageSize: 1 }, { enabled: canViewKyc });
  const { data: summary, isLoading: summaryLoading } = useReportsSummary({ enabled: canViewDashboard });
  const { data: stations, isLoading: stationsLoading } = useAdminStations({ page: 1, pageSize: 100 }, { enabled: canViewStations });
  const { data: stationSummary, isLoading: stationSummaryLoading } = useStationSummary({ enabled: canViewStations });

  const pendingMaintenance = summary
    ? summary.maintenance.by_status.reported + summary.maintenance.by_status.in_progress
    : 0;

  // Task queues only — fleet composition (available / maintenance / …) is the
  // Fleet Status card below, so it isn't repeated here.
  const statCards = [
    canViewBookings && (
      <StatCard key="pickups" label="Awaiting pickup" value={pickups?.total ?? 0} icon={CalendarCheck} />
    ),
    canViewSupport && (
      <StatCard key="tickets" label="Open support tickets" value={openTickets?.total ?? 0} icon={LifeBuoy} tone="warning" />
    ),
    canViewKyc && (
      <StatCard key="kyc" label="Pending KYC" value={kycQueue?.total ?? 0} icon={ShieldCheck} tone="warning" />
    ),
    canViewMaintenance && (
      <StatCard key="maintenance" label="Open maintenance tickets" value={pendingMaintenance} icon={Wrench} tone="warning" />
    ),
  ].filter(Boolean);

  usePageSubtitle(
    `${greetingForHour(new Date().getHours())}, ${user?.name?.split(" ")[0] ?? "there"} — today's operations at a glance`,
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {statCards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{statCards}</div>
      )}

      {canViewVehicles && (
        <FleetStatusCard
          byStatus={summary?.vehicles.by_status}
          total={summary?.vehicles.total ?? 0}
          isLoading={summaryLoading}
        />
      )}

      {canViewStations && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="Station Network" description="Battery swap stations, plotted by status">
            <StationNetworkMap stations={stations?.data ?? []} isLoading={stationsLoading} />
          </ChartCard>
          <ChartCard title="Battery Stations" description="Network health at a glance">
            <StationStatusGauge summary={stationSummary} isLoading={stationSummaryLoading} />
          </ChartCard>
        </div>
      )}

      {canViewBookings && (
        <Card>
          <CardHeader>
            <CardTitle>Next up for vehicle handover</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pickupsLoading || ticketsLoading || kycLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !pickups || pickups.data.length === 0 ? (
              <EmptyState title="Nothing awaiting pickup" />
            ) : (
              pickups.data.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{b.rider.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.vehicle_model?.name} · {b.station?.name} · {formatDate(b.start_day)}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {statCards.length === 0 && !canViewBookings && !canViewVehicles && !canViewStations && (
        <EmptyState title="Nothing to show yet" description="Ask an admin to grant you module access from Settings → Staff Access." />
      )}
    </div>
  );
}
