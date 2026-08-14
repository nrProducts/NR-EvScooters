import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  Users, ShieldCheck, PackageCheck, Bike, IndianRupee, Wrench, Recycle, Navigation, CalendarClock,
  CreditCard, Wallet, Plus, Bell,
} from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/common/StatCard";
import { ChartCard } from "@/components/common/ChartCard";
import { MotionCard } from "@/components/motion/MotionCard";
import { FleetStatusCard, VEHICLE_STATUS_LABEL } from "@/components/dashboard/FleetStatusCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Timeline, type TimelineItem } from "@/components/common/Timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useUsers } from "@/hooks/useUsers";
import { usePickupQueue } from "@/hooks/useBookings";
import { useReportsSummary } from "@/hooks/useReports";
import { useInvoices } from "@/hooks/usePayments";
import { useMaintenanceTickets } from "@/hooks/useMaintenance";
import { useAuditLogs } from "@/hooks/useAudit";
import { useNotificationLog } from "@/hooks/useNotifications";
import { useUiStore } from "@/store/uiStore";
import { cn, formatCurrency, formatDate, greetingForHour, timeAgo } from "@/lib/utils";
import type { PickupBooking, VehicleStatus } from "@/types";

const VEHICLE_STATUS_COLORS: Record<"light" | "dark", Record<VehicleStatus, string>> = {
  light: { available: "#16A34A", booked: "#3B82F6", assigned: "#22C55E", maintenance: "#F59E0B", scrap: "#94A3B8" },
  dark: { available: "#22C55E", booked: "#3B82F6", assigned: "#10B981", maintenance: "#F59E0B", scrap: "#64748B" },
};

function activityTone(action: string): TimelineItem["tone"] {
  if (/approved|verified|resolved|fulfilled|completed/.test(action)) return "success";
  if (/rejected|cancelled|failed|scrap/.test(action)) return "destructive";
  if (/pending|reported/.test(action)) return "warning";
  return "default";
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { theme } = useUiStore();
  const { user } = useAuth();
  const { data: summary, isLoading: summaryLoading } = useReportsSummary();
  const { data: pendingKyc, isLoading: pendingLoading } = useUsers({ page: 1, pageSize: 1, kycStatus: "pending" });
  const { data: recentBookings, isLoading: bookingsLoading } = usePickupQueue({ pageSize: 5 });
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices({ pageSize: 5 });
  const { data: recentMaintenance, isLoading: maintenanceLoading } = useMaintenanceTickets({ pageSize: 5 });
  const { data: recentActivity, isLoading: activityLoading } = useAuditLogs({ pageSize: 6 });
  const { data: recentAlerts, isLoading: alertsLoading } = useNotificationLog({ pageSize: 5 });

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
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greetingForHour(new Date().getHours())} {user?.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">Fleet Performance Overview — real counts from the backend, no fabricated numbers</p>
      </div>

      {/* At-a-glance */}
      {isLoading || !summary ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Available Vehicles" value={summary.vehicles.by_status.available} icon={Bike} tone="success" />
          <StatCard label="Pending KYC" value={pendingKyc?.total ?? 0} icon={ShieldCheck} tone="warning" />
          <StatCard label="Pending Maintenance" value={pendingMaintenance} icon={Wrench} tone="destructive" />
        </div>
      )}

      {/* Fleet Status + Quick Actions */}
      <div className="grid gap-3 lg:grid-cols-2">
        <FleetStatusCard
          byStatus={summary?.vehicles.by_status}
          total={summary?.vehicles.total ?? 0}
          isLoading={summaryLoading}
        />

        <MotionCard>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 p-4 pt-2 sm:grid-cols-3">
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
          <StatCard label="Booked Vehicles" value={summary.vehicles.by_status.booked} icon={CalendarClock} tone="info" />
          <StatCard label="Assigned Vehicles" value={summary.vehicles.by_status.assigned} icon={Navigation} />
          <StatCard label="Active Rentals" value={summary.rides.active_count} icon={Navigation} tone="success" />
          <StatCard label="Maintenance" value={summary.vehicles.by_status.maintenance} icon={Wrench} tone="warning" />
          <StatCard label="Scrapped" value={summary.vehicles.by_status.scrap} icon={Recycle} />
          <StatCard label="Total Riders" value={summary.riders.total} icon={Users} />
          <StatCard label="Active Plans" value={summary.plans.active_subscriptions} icon={CreditCard} />
          <StatCard label="Pending Bookings" value={summary.bookings.pending_count} icon={PackageCheck} tone="warning" />
          <StatCard label="Revenue" value={formatCurrency(summary.revenue.paid_total)} icon={IndianRupee} tone="success" />
          <StatCard label="Pending Payments" value={summary.revenue.pending_count} icon={Wallet} tone="warning" />
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
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Vehicle Status" description="Current fleet by status">
          {summaryLoading || !summary ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={(Object.keys(summary.vehicles.by_status) as VehicleStatus[]).map((s) => ({
                  status: VEHICLE_STATUS_LABEL[s],
                  count: summary.vehicles.by_status[s],
                  fill: statusColors[s],
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={summary.trends.revenue}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={summary.trends.bookings}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={summary.trends.maintenance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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
                    <p className="text-xs text-muted-foreground">{formatCurrency(inv.amount_due)}</p>
                  </div>
                  <StatusBadge status={inv.payment_status} />
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
          <CardHeader className="flex-row items-center gap-2 space-y-0 p-4 pb-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Latest Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2">
            {alertsLoading ? (
              <Skeleton className="h-28 w-full" />
            ) : !recentAlerts || recentAlerts.data.length === 0 ? (
              <EmptyState title="No notifications sent yet" />
            ) : (
              recentAlerts.data.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{n.payload?.title ?? n.template.replace(/_/g, " ")}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.rider?.full_name ?? "—"} · {timeAgo(n.created_at)}</p>
                  </div>
                  <StatusBadge status={n.status} />
                </div>
              ))
            )}
          </CardContent>
        </MotionCard>
      </div>
    </div>
  );
}
