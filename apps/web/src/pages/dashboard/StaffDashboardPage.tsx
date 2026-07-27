import { CalendarCheck, PackageCheck, PackageX, Wrench, ClipboardList, Bike } from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/components/common/ActivityFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { useActivityFeed } from "@/hooks/useDashboard";
import { useBookings } from "@/hooks/useBookings";
import { useMaintenanceTickets } from "@/hooks/useMaintenance";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/utils";
import { STAFF_MEMBERS } from "@/services/api/staff";

export default function StaffDashboardPage() {
  const { data: activity, isLoading: activityLoading } = useActivityFeed();
  const { data: currentBookings } = useBookings({ status: "current", pageSize: 5 });
  const { data: upcomingBookings } = useBookings({ status: "upcoming", pageSize: 5 });
  const { data: openTickets } = useMaintenanceTickets({ status: "open", pageSize: 5 });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today's operations</h1>
        <p className="text-sm text-muted-foreground">Your assigned tasks and queues for today</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Today's Bookings" value={currentBookings?.total ?? 0} icon={CalendarCheck} />
        <StatCard label="Pending Delivery" value={upcomingBookings?.total ?? 0} icon={PackageCheck} tone="warning" />
        <StatCard label="Pending Pickup" value={3} icon={PackageX} tone="warning" />
        <StatCard label="Maintenance Queue" value={openTickets?.total ?? 0} icon={Wrench} tone="destructive" />
        <StatCard label="Assigned Vehicles" value={12} icon={Bike} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>My tasks today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(openTickets?.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{t.issue}</p>
                  <p className="text-xs text-muted-foreground">{t.vehicleReg} · reported {formatDate(t.reportedOn)}</p>
                </div>
                <StatusBadge status={t.priority} />
              </div>
            ))}
            {(openTickets?.data.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No open tasks right now.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {STAFF_MEMBERS.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span>{s.name}</span>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Pending vehicle delivery / pickup
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {(upcomingBookings?.data ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{b.vehicleReg}</p>
                  <p className="text-xs text-muted-foreground">{b.riderName}</p>
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(b.startDate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest activity</CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 overflow-y-auto scrollbar-thin">
            {activityLoading ? <Skeleton className="h-40 w-full" /> : <ActivityFeed events={activity ?? []} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
