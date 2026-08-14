import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { Loader2, MapPinOff } from "lucide-react";
import { CHENNAI_CENTER, DEFAULT_MAP_ZOOM, MAP_STYLE_URL, isMapConfigured } from "@/lib/mapConfig";
import { cn } from "@/lib/utils";
import type { BatteryStation, StationStatus } from "@/types/batteryStation";

const STATUS_COLOR: Record<StationStatus, string> = {
  WORKING: "#16A34A",
  MAINTENANCE: "#F59E0B",
  NOT_WORKING: "#DC2626",
};

/**
 * Read-only network map for the dashboard — every visible station plotted
 * and colour-coded by status. Not a "live fleet" map: vehicles carry no live
 * GPS today (battery_percentage is manually recorded — see Vehicle type),
 * so this shows the real thing the console actually tracks geographically,
 * battery stations, rather than fabricating vehicle positions.
 */
export function StationNetworkMap({
  stations,
  isLoading,
  heightClassName = "h-48",
}: {
  stations: BatteryStation[];
  isLoading?: boolean;
  heightClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (!isMapConfigured()) return;
    let cancelled = false;

    void (async () => {
      try {
        const [lib] = await Promise.all([
          import("maplibre-gl"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (cancelled || !containerRef.current) return;

        libRef.current = lib;
        const map = new lib.Map({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center: [CHENNAI_CENTER.longitude, CHENNAI_CENTER.latitude],
          zoom: DEFAULT_MAP_ZOOM,
          attributionControl: { compact: true },
          interactive: true,
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (status !== "ready" || !map || !lib) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = stations.map((s) =>
      new lib.Marker({ color: STATUS_COLOR[s.status] })
        .setLngLat([s.longitude, s.latitude])
        .setPopup(new lib.Popup({ offset: 16, closeButton: false }).setText(s.name))
        .addTo(map),
    );

    if (stations.length > 0) {
      const bounds = stations.reduce(
        (b, s) => b.extend([s.longitude, s.latitude]),
        new lib.LngLatBounds([stations[0].longitude, stations[0].latitude], [stations[0].longitude, stations[0].latitude]),
      );
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    }
  }, [stations, status]);

  if (!isMapConfigured() || status === "failed") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 px-6 text-center", heightClassName)}>
        <MapPinOff className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Map unavailable</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {isMapConfigured()
            ? "The map failed to load."
            : "Set VITE_MAP_STYLE_URL to enable the station network map."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl border border-border", heightClassName)}>
      <div ref={containerRef} className="h-full w-full" />
      {(status === "loading" || isLoading) && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
