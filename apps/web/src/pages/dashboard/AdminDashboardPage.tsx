import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from "recharts";
import {
  Users, ShieldCheck, PackageCheck, Navigation,
  CreditCard, Wallet, Plus, Bell, ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/common/StatCard";
import { SparkStatCard } from "@/components/common/SparkStatCard";
import { ChartCard } from "@/components/common/ChartCard";
import { MotionCard } from "@/components/motion/MotionCard";
import { useBikeKms, useFleetTelemetry } from "@/hooks/useTelematics";
import { FleetTrackingCard } from "@/components/dashboard/FleetTrackingCard";
import { DashboardKpiRow } from "@/components/dashboard/DashboardKpiRow";
import { RevenueChartCard } from "@/components/dashboard/RevenueChartCard";
import { NeedsAttentionCard } from "@/components/dashboard/NeedsAttentionCard";
import { UpcomingDuesCard } from "@/components/dashboard/UpcomingDuesCard";
import { summariseFleet } from "@/services/api/telematics";
import { FleetAllowanceCard } from "@/components/fleet/FleetAllowanceCard";
import { FleetStatusCard } from "@/components/dashboard/FleetStatusCard";
import { RevenueOverview } from "@/components/revenue/RevenueOverview";
import { HorizontalSummaryCard } from "@/components/dashboard/HorizontalSummaryCard";
import { FleetLiveMap } from "@/components/fleet/FleetLiveMap";
import { StationStatusGauge } from "@/components/dashboard/StationStatusGauge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Timeline, type TimelineItem } from "@/components/common/Timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsers } from "@/hooks/useUsers";
import { usePickupQueue } from "@/hooks/useBookings";
import { useReportsSummary } from "@/hooks/useReports";
import { useInvoices } from "@/hooks/usePayments";
import { useMaintenanceTickets } from "@/hooks/useMaintenance";
import { useAuditLogs } from "@/hooks/useAudit";
import { useNotificationLog } from "@/hooks/useNotifications";
import { useStationSummary } from "@/hooks/useBatteryStations";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn, formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import type { PickupBooking } from "@/types";

const NOTIFICATION_DOT: Record<string, string> = {
  sent: "bg-success",
  pending: "bg-warning",
  failed: "bg-destructive",
};

/** "2026-03" -> "Mar" — short enough to fit a quarter-width chart's x-axis. */
function monthLabel(month: string): string {
  const d = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString("en-IN", { month: "short" });
}

function activityTone(action: string): TimelineItem["tone"] {
  if (/approved|verified|resolved|fulfilled|completed/.test(action)) return "success";
  // `scrap` matches the `vehicle.scrapped` AUDIT ACTION, which kept its name
  // — only the vehicle STATUS was renamed to `retired`. Both are listed so a
  // rename on either side does not quietly stop colouring these rows.
  if (/rejected|cancelled|failed|scrap|retired/.test(action)) return "destructive";
  if (/pending|reported/.test(action)) return "warning";
  return "default";
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data: summary, isLoading: summaryLoading } = useReportsSummary();
  const { data: pendingKyc, isLoading: pendingLoading } = useUsers({ page: 1, pageSize: 1, kycStatus: "pending" });
  const { data: recentBookings, isLoading: bookingsLoading } = usePickupQueue({ pageSize: 5 });
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices({ pageSize: 5 });
  const { data: recentMaintenance, isLoading: maintenanceLoading } = useMaintenanceTickets({ pageSize: 5 });
  const { data: recentActivity, isLoading: activityLoading } = useAuditLogs({ pageSize: 6 });
  const { data: recentAlerts, isLoading: alertsLoading } = useNotificationLog({ pageSize: 5 });
  const { data: fleetTelemetry } = useFleetTelemetry();
  const { data: bikeKms } = useBikeKms();
  const kmToday = useMemo(() => new Map((bikeKms ?? []).map((b) => [b.vehicle.id, b.km_today])), [bikeKms]);
  const { data: stationSummary, isLoading: stationSummaryLoading } = useStationSummary();
  const fleetStats = useMemo(() => summariseFleet(fleetTelemetry ?? []), [fleetTelemetry]);

  usePageSubtitle("Fleet, rentals, revenue and staff — the whole operation at a glance.");

  const isLoading = summaryLoading || pendingLoading;
  const pendingMaintenance = summary
    ? summary.maintenance.by_status.reported + summary.maintenance.by_status.in_progress
    : 0;

  const bookingColumns: DataTableColumn<PickupBooking>[] = [
    {
      header: "Booking",
      key: "id",
      render: (b) => <span className="font-mono text-xs text-muted-foreground">#{b.id.slice(0, 8).toUpperCase()}</span>,
    },
    { header: "Rider", key: "rider", render: (b) => b.rider.full_name },
    { header: "Vehicle", key: "vehicle", render: (b) => b.vehicle_model?.name ?? "—", hideOnMobile: true },
    { header: "Station", key: "station", render: (b) => b.station?.name ?? "—", hideOnMobile: true },
    { header: "Start Day", key: "start", render: (b) => formatDate(b.start_day) },
    {
      header: "Amount",
      key: "amount",
      render: (b) => (b.plan ? formatCurrency(b.plan.price) : "—"),
      hideOnMobile: true,
    },
    { header: "Status", key: "status", render: (b) => <StatusBadge status={b.status} /> },
    {
      header: "",
      key: "actions",
      render: () => (
        <Button size="sm" variant="ghost" onClick={() => navigate("/bookings")}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* No full-screen loader — every section below renders its own skeleton
          while its query is in flight, so the dashboard fills in progressively
          instead of being blocked behind one overlay. */}

      {/* Headline money row, then the three rows of the layout: revenue / allowance / tracking,
          the live map beside what needs attention and the quick actions, and fleet status beside
          the battery network. */}
      <DashboardKpiRow />

      {/* The grid: every row's cards share one height and one top and bottom edge, and only the
          live map is large. */}

      {/* Row 2 — revenue chart (2 columns), then a column of two short fleet cards, then the riders who are due. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueChartCard className="sm:col-span-2" />
        {/* Two equal halves: both cards get the same height. */}
        <div className="grid grid-rows-2 gap-4">
          <FleetAllowanceCard variant="gauge" />
          <FleetTrackingCard />
        </div>
        <UpcomingDuesCard rows={6} />
      </div>

      {/* Row 3 — the big map (2 of 3 columns) beside three small cards stacked to its height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="Fleet Live Map"
          description="Every bike, by status — green live, amber stale, grey offline, red low battery"
          className="lg:col-span-2"
          fill
          still
          action={
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => navigate("/vehicles?view=kms")}>Bike KMs</Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("/live-map")}>Open map</Button>
            </div>
          }
        >
          <FleetLiveMap items={fleetTelemetry ?? []} kmToday={kmToday} heightClassName="min-h-[22rem] flex-1" />
        </ChartCard>

        <div className="flex flex-col gap-4">
          <NeedsAttentionCard
            pendingKyc={pendingKyc?.total ?? 0}
            lowBattery={fleetStats.lowBattery}
            pendingMaintenance={pendingMaintenance}
            isLoading={isLoading || !summary}
          />

          {/* Three tiles in a row rather than three stacked buttons. */}
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Quick Actions</h3>
            <div className="grid grid-cols-3 gap-2">
              <Button className="h-auto flex-col gap-1.5 rounded-xl px-1 py-3 text-[0.6875rem]" onClick={() => navigate("/vehicles?new=1")}>
                <Plus className="h-4 w-4" /> Add Vehicle
              </Button>
              <Button variant="outline" className="h-auto flex-col gap-1.5 rounded-xl px-1 py-3 text-[0.6875rem]" onClick={() => navigate("/bookings")}>
                <PackageCheck className="h-4 w-4 text-primary" /> Assign
              </Button>
              <Button variant="outline" className="h-auto flex-col gap-1.5 rounded-xl px-1 py-3 text-[0.6875rem]" onClick={() => navigate("/kyc")}>
                <ShieldCheck className="h-4 w-4 text-primary" /> Approve KYC
              </Button>
            </div>
          </Card>

          <FleetStatusCard
            byStatus={summary?.vehicles.by_status}
            total={summary?.vehicles.total ?? 0}
            isLoading={summaryLoading}
            compact
          />
        </div>
      </div>

      {/* Row 4 — three small cards, equal width and height: the battery network and the staff. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard
          title="Battery Stations"
          description="Network health at a glance"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate("/battery-stations")}>
              View all
            </Button>
          }
        >
          <StationStatusGauge summary={stationSummary} isLoading={stationSummaryLoading} compact />
        </ChartCard>

        <HorizontalSummaryCard
          icon={Users}
          title="Staff Attendance"
          isLoading={isLoading || !summary}
          metrics={[
            { label: "Total", value: summary?.attendance.total_staff ?? 0 },
            { label: "Present", value: summary?.attendance.present_today ?? 0, tone: "success" },
            { label: "Absent", value: summary?.attendance.absent_today ?? 0, tone: "destructive" },
            { label: "On Leave", value: summary?.attendance.on_leave_today ?? 0, tone: "info" },
            { label: "Week Off", value: summary?.attendance.on_week_off_today ?? 0 },
          ]}
          linkLabel="View Attendance"
          onLinkClick={() => navigate("/attendance")}
        />

        <HorizontalSummaryCard
          icon={ClipboardList}
          iconTone="warning"
          title="Leave Management"
          isLoading={isLoading || !summary}
          primaryMetric={`${summary?.leave.pending_count ?? 0} Pending Request${summary?.leave.pending_count === 1 ? "" : "s"}`}
          metrics={[
            { label: "Pending", value: summary?.leave.pending_count ?? 0, tone: "warning" },
            { label: "Approved", value: summary?.leave.approved_count ?? 0, tone: "success" },
            { label: "Rejected", value: summary?.leave.rejected_count ?? 0, tone: "destructive" },
          ]}
          linkLabel="View Requests"
          onLinkClick={() => navigate("/leave")}
        />
      </div>

      <RevenueOverview part="deposits" />

      {/* Operational counts — fleet composition lives in Fleet Status above and
          money in the Revenue Overview, so this row is the business metrics that
          appear nowhere else. */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Operations</h2>
      {isLoading || !summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Active Rentals" value={summary.rides.active_count} icon={Navigation} tone="success" />
          <StatCard label="Total Riders" value={summary.riders.total} icon={Users} />
          <StatCard label="Active Plans" value={summary.plans.active_subscriptions} icon={CreditCard} />
          <StatCard label="Pending Bookings" value={summary.bookings.pending_count} icon={PackageCheck} tone="warning" />
          <StatCard label="Pending Payments" value={summary.revenue.pending_count} icon={Wallet} tone="warning" />
        </div>
      )}

      {/* Trends at a glance — revenue trend is on the Revenue screen, so this is bookings + maintenance only. */}
      {summaryLoading || !summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SparkStatCard
            label="Bookings (this month)"
            value={String(summary.trends.bookings.at(-1)?.count ?? 0)}
            points={summary.trends.bookings.map((t) => t.count)}
            tone="info"
          />
          <SparkStatCard
            label="Maintenance (this month)"
            value={String(summary.trends.maintenance.at(-1)?.count ?? 0)}
            points={summary.trends.maintenance.map((t) => t.count)}
            tone="warning"
          />
        </div>
      )}
      </div>

      {/* Recent Bookings table */}
      <MotionCard>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Recent Bookings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={bookingColumns}
            data={recentBookings?.data ?? []}
            isLoading={bookingsLoading}
            emptyTitle="No bookings awaiting pickup"
          />
        </CardContent>
      </MotionCard>

      {/* Analytics — fleet-by-status is the Fleet Status card, revenue trend is
          the Revenue screen; this row is bookings + maintenance history. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ChartCard title="Bookings" description="Last 6 months, created">
          {summaryLoading || !summary ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={summary.trends.bookings}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} isAnimationActive />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Maintenance Trend" description="Last 6 months, tickets reported">
          {summaryLoading || !summary ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={summary.trends.maintenance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--warning))" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Widgets */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MotionCard>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {invoicesLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : !recentInvoices || recentInvoices.data.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              recentInvoices.data.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.rider?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(inv.total_amount)}</p>
                  </div>
                  <StatusBadge status={inv.payment_state} />
                </div>
              ))
            )}
          </CardContent>
        </MotionCard>

        <MotionCard>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Recent Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {maintenanceLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : !recentMaintenance || recentMaintenance.data.length === 0 ? (
              <EmptyState title="No maintenance tickets yet" />
            ) : (
              recentMaintenance.data.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.vehicle?.name ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))
            )}
          </CardContent>
        </MotionCard>

        <MotionCard>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {activityLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : !recentActivity || recentActivity.data.length === 0 ? (
              <EmptyState title="No actions logged yet" />
            ) : (
              <Timeline
                items={recentActivity.data.map((a) => ({
                  id: a.id,
                  title: a.action.replace(/\./g, " · ").replace(/_/g, " "),
                  timestamp: timeAgo(a.created_at),
                  description: a.actor?.full_name ?? "System",
                  tone: activityTone(a.action),
                }))}
              />
            )}
          </CardContent>
        </MotionCard>

        <MotionCard>
          <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Alerts</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/notifications")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 p-4 pt-2">
            {alertsLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : !recentAlerts || recentAlerts.data.length === 0 ? (
              <EmptyState title="No notifications sent yet" />
            ) : (
              recentAlerts.data.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 border-b border-border py-2 text-sm last:border-0">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", NOTIFICATION_DOT[n.status] ?? "bg-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{n.payload?.title ?? n.template.replace(/_/g, " ")}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.rider?.full_name ?? "—"}</p>
                  </div>
                  <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{timeAgo(n.created_at)}</span>
                </div>
              ))
            )}
          </CardContent>
        </MotionCard>
      </div>
    </div>
  );
}
