import { Map } from "lucide-react";
import { NotConnected } from "@/components/common/NotConnected";

export default function LiveMapPage() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live map</h1>
        <p className="text-sm text-muted-foreground">Every scooter, plotted by current status</p>
      </div>
      <NotConnected
        icon={Map}
        title="No vehicle location data exposed yet"
        description="Stations store a PostGIS geography column, but there's no fleet-vehicles endpoint at all (see the Vehicles page) and no view/function that returns plain lat/lng for a map. This needs both a vehicles list endpoint and a geo-friendly projection of station/vehicle location."
        missingEndpoints={["GET /vehicles (with station lat/lng)", "GET /stations (list, not just /nearest)"]}
      />
    </div>
  );
}
