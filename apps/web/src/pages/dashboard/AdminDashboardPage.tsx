import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  Users, ShieldCheck, PackageCheck, Bike, IndianRupee, Wrench, Recycle, Navigation, CalendarClock,
  CreditCard, Wallet, Plus, Bell, ClipboardList,
} from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/common/StatCard";
import { SparkStatCard } from "@/components/common/SparkStatCard";
import { ChartCard } from "@/components/common/ChartCard";
import { MotionCard } from "@/components/motion/MotionCard";
import { FleetStatusCard, VEHICLE_STATUS_LABEL } from "@/components/dashboard/FleetStatusCard";
import { RevenueOverview } from "@/components/revenue/RevenueOverview";
import { HorizontalSummaryCard } from "@/components/dashboard/HorizontalSummaryCard";
import { StationNetworkMap } from "@/components/dashboard/StationNetworkMap";
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
import { useAdminStations, useStationSummary } from "@/hooks/useBatteryStations";
import { useUiStore } from "@/store/uiStore";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn, formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import type { PickupBooking, VehicleStatus } from "@/types";

const NOTIFICATION_DOT: Record<string, string> = {
  sent: "bg-success",
  pending: "bg-warning",
  failed: "bg-destructive",
};

const VEHICLE_STATUS_COLORS: Record<"light" | "dark", Record<VehicleStatus, string>> = {
  light: { available: "#16A34A", reserved: "#3B82F6", assigned: "#21C45D", maintenance: "#F59E0B", retired: "#94A3B8" },
  dark: { available: "#21C45D", reserved: "#3B82F6", assigned: "#10B981", maintenance: "#F59E0B", retired: "#64748B" },
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
  const { theme } = useUiStore();
  const { data: summary, isLoading: summaryLoading } = useReportsSummary();
  const { data: pendingKyc, isLoading: pendingLoading } = useUsers({ page: 1, pageSize: 1, kycStatus: "pending" });
  const { data: recentBookings, isLoading: bookingsLoading } = usePickupQueue({ pageSize: 5 });
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices({ pageSize: 5 });
  const { data: recentMaintenance, isLoading: maintenanceLoading } = useMaintenanceTickets({ pageSize: 5 });
  const { data: recentActivity, isLoading: activityLoading } = useAuditLogs({ pageSize: 6 });
  const { data: recentAlerts, isLoading: alertsLoading } = useNotificationLog({ pageSize: 5 });
  const { data: stations, isLoading: stationsLoading } = useAdminStations({ page: 1, pageSize: 100 });
  const { data: stationSummary, isLoading: stationSummaryLoading } = useStationSummary();

  usePageSubtitle("Fleet, rentals, revenue and staff — the whole operation at a glance.");

  const isLoading = summaryLoading || pendingLoading;
  const statusColors = VEHICLE_STATUS_COLORS[theme === "dark" ? "dark" : "light"];
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

      <RevenueOverview />

      {/* At-a-glance — Fleet Overview / Staff Attendance / Leave Management, side by side on larger
          screens. Stretched (the grid default) rather than items-start, so all three sit on the same
          bottom edge even though only Fleet Overview has a footer progress bar. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <HorizontalSummaryCard
          icon={Bike}
          iconTone="success"
          title="Fleet Overview"
          isLoading={isLoading || !summary}
          metrics={[
            { label: "Available", value: summary?.vehicles.by_status.available ?? 0, tone: "success" },
            { label: "Pending KYC", value: pendingKyc?.total ?? 0, tone: "warning" },
            { label: "Pending Maintenance", value: pendingMaintenance, tone: "destructive" },
          ]}
          linkLabel="View Fleet"
          onLinkClick={() => navigate("/vehicles")}
          footer={
            summary && summary.vehicles.total > 0 ? (
              <div className="mt-2.5 space-y-1">
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-success"
                    style={{ width: `${(summary.vehicles.by_status.available / summary.vehicles.total) * 100}%` }}
                  />
                  <div
                    className="h-full bg-info"
                    style={{ width: `${(summary.vehicles.by_status.reserved / summary.vehicles.total) * 100}%` }}
                  />
                </div>
                <p className="text-center text-[0.6875rem] text-muted-foreground">Available / Reserved</p>
              </div>
            ) : undefined
          }
        />

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

      {/* Station Network (wide, left) + Fleet Status / Quick Actions / Battery Stations (compact, right) */}
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard title="Station Network" description="Battery swap stations, plotted by status" className="lg:col-span-2">
          <StationNetworkMap stations={stations?.data ?? []} isLoading={stationsLoading} heightClassName="h-[27rem]" />
        </ChartCard>

        <div className="flex flex-col gap-3">
          <FleetStatusCard
            byStatus={summary?.vehicles.by_status}
            total={summary?.vehicles.total ?? 0}
            isLoading={summaryLoading}
            compact
          />

          <MotionCard>
            <CardHeader className="p-3 pb-1.5">
              <CardTitle className="text-xs">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 p-3 pt-1">
              <Button size="sm" className="justify-start gap-2" onClick={() => navigate("/vehicles?new=1")}>
                <Plus className="h-4 w-4" /> Add Vehicle
              </Button>
              <Button size="sm" variant="outline" className="justify-start gap-2" onClick={() => navigate("/bookings")}>
                <PackageCheck className="h-4 w-4" /> Assign Vehicle
              </Button>
              <Button size="sm" variant="outline" className="justify-start gap-2" onClick={() => navigate("/kyc")}>
                <ShieldCheck className="h-4 w-4" /> Approve KYC
              </Button>
            </CardContent>
          </MotionCard>

          <ChartCard
            title="Battery Stations"
            description="Network health at a glance"
            className="flex-1"
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate("/battery-stations")}>
                View all
              </Button>
            }
          >
            <StationStatusGauge summary={stationSummary} isLoading={stationSummaryLoading} compact />
          </ChartCard>
        </div>
      </div>

      {/* Statistics grid, 2 rows */}
      {isLoading || !summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Total Vehicles" value={summary.vehicles.total} icon={Bike} />
          <StatCard label="Available Vehicles" value={summary.vehicles.by_status.available} icon={Bike} tone="success" />
          <StatCard label="Reserved Vehicles" value={summary.vehicles.by_status.reserved} icon={CalendarClock} tone="info" />
          <StatCard label="Assigned Vehicles" value={summary.vehicles.by_status.assigned} icon={Navigation} />
          <StatCard label="Active Rentals" value={summary.rides.active_count} icon={Navigation} tone="success" />
          <StatCard label="Maintenance" value={summary.vehicles.by_status.maintenance} icon={Wrench} tone="warning" />
          <StatCard label="Retired" value={summary.vehicles.by_status.retired} icon={Recycle} />
          <StatCard label="Total Riders" value={summary.riders.total} icon={Users} />
          <StatCard label="Active Plans" value={summary.plans.active_subscriptions} icon={CreditCard} />
          <StatCard label="Pending Bookings" value={summary.bookings.pending_count} icon={PackageCheck} tone="warning" />
          <StatCard label="Revenue" value={formatCurrency(summary.revenue.paid_total)} icon={IndianRupee} tone="success" />
          <StatCard label="Pending Payments" value={summary.revenue.pending_count} icon={Wallet} tone="warning" />
        </div>
      )}

      {/* Trends at a glance — real month-over-month series, not fabricated deltas */}
      {summaryLoading || !summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SparkStatCard
            label="Revenue (this month)"
            value={formatCurrency(summary.trends.revenue.at(-1)?.amount ?? 0)}
            points={summary.trends.revenue.map((t) => t.amount)}
            tone="success"
          />
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

      {/* Analytics */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Vehicle Status" description="Current fleet by status">
          {summaryLoading || !summary ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <BarChart
                data={(Object.keys(summary.vehicles.by_status) as VehicleStatus[]).map((s) => ({
                  status: VEHICLE_STATUS_LABEL[s],
                  count: summary.vehicles.by_status[s],
                  fill: statusColors[s],
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Revenue" description="Last 6 months, invoices paid">
          {summaryLoading || !summary ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={summary.trends.revenue}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} width={32} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  isAnimationActive
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

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
