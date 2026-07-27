import { Radio, ShieldAlert, PackageCheck, Bike } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { NotConnected } from "@/components/common/NotConnected";
import { usePickupQueue } from "@/hooks/useBookings";
import { useSupportQueue } from "@/hooks/useSupport";

export default function LiveMonitoringPage() {
  const { data: pickups, isLoading: pickupsLoading } = usePickupQueue({ pageSize: 1 });
  const { data: openTickets, isLoading: ticketsLoading } = useSupportQueue({ status: "open", pageSize: 1 });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live monitoring</h1>
          <p className="text-sm text-muted-foreground">What's real from the backend today — no vehicle telemetry yet</p>
        </div>
      </div>

      {pickupsLoading || ticketsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Bookings awaiting pickup" value={pickups?.total ?? 0} icon={PackageCheck} />
          <StatCard label="Open support tickets" value={openTickets?.total ?? 0} icon={ShieldAlert} tone="warning" />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bike className="h-4 w-4" /> Fleet telemetry
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <NotConnected
            title="No live vehicle telemetry yet"
            description="Online/offline, moving/idle, GPS-lost, low-battery and SOS status all depend on a vehicles endpoint and live location/GPS fields that don't exist in the schema or API yet."
            missingEndpoints={["GET /vehicles", "vehicle GPS/telemetry fields"]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
