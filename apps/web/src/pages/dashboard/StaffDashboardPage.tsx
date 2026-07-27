import { CalendarCheck, LifeBuoy, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { usePickupQueue } from "@/hooks/useBookings";
import { useSupportQueue } from "@/hooks/useSupport";
import { useKycQueue } from "@/hooks/useKyc";
import { formatDate } from "@/lib/utils";

export default function StaffDashboardPage() {
  const { data: pickups, isLoading: pickupsLoading } = usePickupQueue({ pageSize: 5 });
  const { data: openTickets, isLoading: ticketsLoading } = useSupportQueue({ status: "open", pageSize: 1 });
  const { data: kycQueue, isLoading: kycLoading } = useKycQueue({ status: "pending", pageSize: 1 });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today's operations</h1>
        <p className="text-sm text-muted-foreground">Real queues pulled from the backend</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Awaiting pickup" value={pickups?.total ?? 0} icon={CalendarCheck} />
        <StatCard label="Open support tickets" value={openTickets?.total ?? 0} icon={LifeBuoy} tone="warning" />
        <StatCard label="Pending KYC" value={kycQueue?.total ?? 0} icon={ShieldCheck} tone="warning" />
      </div>

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

      <p className="text-xs text-muted-foreground">
        Maintenance queue and assigned-vehicle counts aren't shown — the backend has no admin-facing maintenance
        or fleet-assignment endpoint yet.
      </p>
    </div>
  );
}
