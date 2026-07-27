import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from "recharts";
import {
  Users, ShieldCheck, PackageCheck, LifeBuoy, Bike, IndianRupee, Wrench, Recycle, Route, CalendarClock,
  CreditCard, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { ChartCard } from "@/components/common/ChartCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useRiders } from "@/hooks/useRiders";
import { usePickupQueue } from "@/hooks/useBookings";
import { useSupportQueue } from "@/hooks/useSupport";
import { useReportsSummary } from "@/hooks/useReports";
import { useInvoices } from "@/hooks/usePayments";
import { useMaintenanceTickets } from "@/hooks/useMaintenance";
import { useAuditLogs } from "@/hooks/useAudit";
import { useUiStore } from "@/store/uiStore";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";
import type { VehicleStatus } from "@/types";

const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  booked: "Booked",
  assigned: "Assigned",
  maintenance: "Maintenance",
  scrap: "Scrapped",
};

const VEHICLE_STATUS_COLORS: Record<"light" | "dark", Record<VehicleStatus, string>> = {
  light: { available: "#2a78d6", booked: "#eb6834", assigned: "#1baf7a", maintenance: "#eda100", scrap: "#898781" },
  dark: { available: "#3987e5", booked: "#d95926", assigned: "#199e70", maintenance: "#c98500", scrap: "#6b7280" },
};

export default function AdminDashboardPage() {
  const { theme } = useUiStore();
  const { data: summary, isLoading: summaryLoading } = useReportsSummary();
  const { data: pendingKyc, isLoading: pendingLoading } = useRiders({ page: 1, pageSize: 1, kycStatus: "pending" });
  const { data: openTickets, isLoading: ticketsLoading } = useSupportQueue({ status: "open", pageSize: 1 });
  const { data: recentBookings, isLoading: bookingsLoading } = usePickupQueue({ pageSize: 5 });
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices({ pageSize: 5 });
  const { data: recentMaintenance, isLoading: maintenanceLoading } = useMaintenanceTickets({ pageSize: 5 });
  const { data: recentActivity, isLoading: activityLoading } = useAuditLogs({ pageSize: 6 });

  const isLoading = summaryLoading || pendingLoading || ticketsLoading;
  const statusColors = VEHICLE_STATUS_COLORS[theme === "dark" ? "dark" : "light"];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="text-sm text-muted-foreground">Real counts from the backend — no fabricated numbers</p>
      </div>

      {isLoading || !summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Total Vehicles" value={summary.vehicles.total} icon={Bike} />
          <StatCard label="Available Vehicles" value={summary.vehicles.by_status.available} icon={Bike} tone="success" />
          <StatCard label="Booked Vehicles" value={summary.vehicles.by_status.booked} icon={CalendarClock} tone="warning" />
          <StatCard label="Assigned Vehicles" value={summary.vehicles.by_status.assigned} icon={Route} />
          <StatCard label="Ride Active" value={summary.rides.active_count} icon={Route} tone="success" />
          <StatCard label="Maintenance" value={summary.vehicles.by_status.maintenance} icon={Wrench} tone="destructive" />
          <StatCard label="Scrapped" value={summary.vehicles.by_status.scrap} icon={Recycle} />
          <StatCard label="Total Riders" value={summary.riders.total} icon={Users} />
          <StatCard label="Active Plans" value={summary.plans.active_subscriptions} icon={CreditCard} />
          <StatCard label="Pending Bookings" value={summary.bookings.pending_count} icon={PackageCheck} tone="warning" />
          <StatCard label="Revenue" value={formatCurrency(summary.revenue.paid_total)} icon={IndianRupee} tone="success" />
          <StatCard label="Pending Payments" value={summary.revenue.pending_count} icon={Wallet} tone="warning" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pending KYC" value={pendingKyc?.total ?? 0} icon={ShieldCheck} tone="warning" />
        <StatCard label="Open support tickets" value={openTickets?.total ?? 0} icon={LifeBuoy} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Vehicle Status" description="Current fleet by status">
          {summaryLoading || !summary ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly Revenue" description="Last 6 months, invoices paid">
          {summaryLoading || !summary ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={summary.trends.revenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Bookings" description="Last 6 months, created">
          {summaryLoading || !summary ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={summary.trends.bookings}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Maintenance Trend" description="Last 6 months, tickets reported">
          {summaryLoading || !summary ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={summary.trends.maintenance}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Bookings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {bookingsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !recentBookings || recentBookings.data.length === 0 ? (
              <EmptyState title="No bookings awaiting pickup" />
            ) : (
              recentBookings.data.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{b.rider.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.vehicle_model?.name ?? "—"} · {b.station?.name ?? "—"}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoicesLoading ? (
              <Skeleton className="h-32 w-full" />
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
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {maintenanceLoading ? (
              <Skeleton className="h-32 w-full" />
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
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activityLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !recentActivity || recentActivity.data.length === 0 ? (
              <EmptyState title="No actions logged yet" />
            ) : (
              recentActivity.data.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.action.replace(/\./g, " · ").replace(/_/g, " ")}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.actor?.full_name ?? "System"} · {formatDate(a.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
