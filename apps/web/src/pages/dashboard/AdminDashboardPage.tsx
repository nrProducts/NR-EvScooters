import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Bike, Users, IndianRupee, ShieldCheck, BatteryCharging, Wrench, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { ChartCard } from "@/components/common/ChartCard";
import { ActivityFeed } from "@/components/common/ActivityFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardSummary, useActivityFeed } from "@/hooks/useDashboard";
import { formatCurrency } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  available: "#16a34a",
  booked: "#2563eb",
  assigned: "#3b82f6",
  charging: "#f59e0b",
  maintenance: "#dc2626",
  scrap: "#6b7280",
  offline: "#94a3b8",
};

export default function AdminDashboardPage() {
  const { data: summary, isLoading } = useDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useActivityFeed();

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="text-sm text-muted-foreground">Chennai · Sholinganallur &amp; Thoraipakkam operations</p>
      </div>

      {/* Top summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Total Vehicles" value={summary.vehicles.total} icon={Bike} />
        <StatCard label="Available" value={summary.vehicles.available} icon={Bike} tone="success" />
        <StatCard label="Booked" value={summary.vehicles.booked} icon={Bike} />
        <StatCard label="Charging" value={summary.vehicles.charging} icon={BatteryCharging} tone="warning" />
        <StatCard label="Maintenance" value={summary.vehicles.maintenance} icon={Wrench} tone="destructive" />
        <StatCard label="Scrap" value={summary.vehicles.scrap} icon={AlertTriangle} tone="warning" />
        <StatCard label="Total Riders" value={summary.riders.total} icon={Users} />
        <StatCard label="Pending KYC" value={summary.riders.pendingKyc} icon={ShieldCheck} tone="warning" />
        <StatCard label="Approved KYC" value={summary.riders.approvedKyc} icon={ShieldCheck} tone="success" />
        <StatCard label="Revenue Today" value={formatCurrency(summary.revenue.today)} icon={IndianRupee} />
        <StatCard label="Revenue This Week" value={formatCurrency(summary.revenue.thisWeek)} icon={IndianRupee} />
        <StatCard
          label="Outstanding Payments"
          value={formatCurrency(summary.revenue.outstanding)}
          icon={IndianRupee}
          tone="destructive"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Fleet Utilization" description="Last 14 days" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={summary.fleetUtilization}>
              <defs>
                <linearGradient id="util" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217 91% 48%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(217 91% 48%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip formatter={(v: number) => [`${v}%`, "Utilization"]} />
              <Area type="monotone" dataKey="utilization" stroke="hsl(217 91% 48%)" fill="url(#util)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Vehicle Status Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={summary.vehicleStatusDistribution}
                dataKey="count"
                nameKey="status"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {summary.vehicleStatusDistribution.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {summary.vehicleStatusDistribution.map((e) => (
              <span key={e.status} className="flex items-center gap-1 capitalize text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[e.status] }} />
                {e.status} ({e.count})
              </span>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue Trend" description="Last 14 days">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={summary.revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(152 60% 36%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Bookings" description="Last 14 days">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={summary.dailyBookings}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(217 91% 48%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 3 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Weekly Rentals">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.weeklyRentals}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Monthly Rentals">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={summary.monthlyRentals}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="hsl(38 92% 50%)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Battery Health Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summary.batteryHealthDistribution} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="range" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(152 60% 36%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Activity feed + heat map placeholder */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ride Heat Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Heat map placeholder — plug in Google Maps heat map layer once API key is configured.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Activity</CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto scrollbar-thin">
            {activityLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ActivityFeed events={activity ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
