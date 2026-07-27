import { MapPin, Gauge } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { BatteryIndicator } from "./BatteryIndicator";
import type { Vehicle } from "@/types";

export function VehicleCard({ vehicle, onClick }: { vehicle: Vehicle; onClick?: () => void }) {
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-soft" onClick={onClick}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">{vehicle.registrationNumber}</p>
            <p className="text-xs text-muted-foreground">{vehicle.model}</p>
          </div>
          <StatusBadge status={vehicle.status} />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {vehicle.station}
          </span>
          <span className="flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" /> {vehicle.odometerKm.toLocaleString()} km
          </span>
        </div>
        <BatteryIndicator percent={vehicle.batteryPercent} />
      </CardContent>
    </Card>
  );
}
