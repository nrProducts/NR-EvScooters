import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { MapWidget } from "@/components/common/MapWidget";
import { SideDrawer } from "@/components/common/SideDrawer";
import { StatusBadge } from "@/components/common/StatusBadge";
import { BatteryIndicator } from "@/components/common/BatteryIndicator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicles } from "@/hooks/useVehicles";
import type { Vehicle } from "@/types";

export default function LiveMapPage() {
  const { data, isLoading } = useVehicles({ pageSize: 500 });
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const navigate = useNavigate();

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live map</h1>
        <p className="text-sm text-muted-foreground">Every scooter, plotted by current status</p>
      </div>

      <Card>
        <CardContent className="p-3">
          {isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : (
            <MapWidget vehicles={data?.data ?? []} onSelect={setSelected} height={480} />
          )}
        </CardContent>
      </Card>

      <SideDrawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Vehicle details">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">{selected.registrationNumber}</p>
              <StatusBadge status={selected.status} />
            </div>
            <p className="text-sm text-muted-foreground">{selected.model} · {selected.station}</p>
            <BatteryIndicator percent={selected.batteryPercent} />
            <Button className="w-full" onClick={() => navigate(`/vehicles/${selected.id}`)}>
              Open full details
            </Button>
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
