import { Radio, Wifi, WifiOff, Navigation, PauseCircle, BatteryCharging, BatteryWarning, MapPinOff, ShieldAlert, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { ActivityFeed } from "@/components/common/ActivityFeed";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicles } from "@/hooks/useVehicles";
import { useActivityFeed } from "@/hooks/useDashboard";

export default function LiveMonitoringPage() {
  const { data, isLoading } = useVehicles({ pageSize: 500 });
  const { data: activity, isLoading: activityLoading } = useActivityFeed();
  const vehicles = data?.data ?? [];

  const online = vehicles.filter((v) => v.gpsOnline).length;
  const offline = vehicles.length - online;
  const moving = vehicles.filter((v) => v.status === "booked" || v.status === "assigned").length;
  const idle = vehicles.filter((v) => v.status === "available").length;
  const charging = vehicles.filter((v) => v.status === "charging").length;
  const lowBattery = vehicles.filter((v) => v.batteryPercent < 20).length;
  const gpsLost = vehicles.filter((v) => !v.gpsOnline).length;
  const maintenanceDue = vehicles.filter((v) => v.status === "maintenance").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live monitoring</h1>
          <p className="text-sm text-muted-foreground">Real-time fleet status · auto-refreshes every 15s</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Live Vehicles" value={vehicles.length} icon={Radio} />
          <StatCard label="Online" value={online} icon={Wifi} tone="success" />
          <StatCard label="Offline" value={offline} icon={WifiOff} tone="destructive" />
          <StatCard label="Moving" value={moving} icon={Navigation} />
          <StatCard label="Idle" value={idle} icon={PauseCircle} />
          <StatCard label="Charging" value={charging} icon={BatteryCharging} tone="warning" />
          <StatCard label="Low Battery" value={lowBattery} icon={BatteryWarning} tone="destructive" />
          <StatCard label="GPS Lost" value={gpsLost} icon={MapPinOff} tone="destructive" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="SOS Alerts" value={0} icon={ShieldAlert} tone="success" />
        <StatCard label="Maintenance Due" value={maintenanceDue} icon={Wrench} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Live activity feed</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {activityLoading ? <Skeleton className="h-40 w-full" /> : <ActivityFeed events={activity ?? []} />}
        </CardContent>
      </Card>
    </div>
  );
}
