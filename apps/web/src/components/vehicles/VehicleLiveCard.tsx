import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { BatteryMedium, ExternalLink, Gauge, KeyRound, Lock, LockOpen, MapPinOff, Radio, Route, Thermometer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VehicleControlDialog } from "@/components/vehicles/VehicleControlDialog";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/common/Spinner";
import { useControlCommands, useVehicleTelemetry } from "@/hooks/useTelematics";
import { isMapConfigured, mapStyleForTheme, tuneDarkMapLabels } from "@/lib/mapConfig";
import { useUiStore } from "@/store/uiStore";
import { cn, formatFullDateTime, timeAgo } from "@/lib/utils";
import type { VehicleTelemetry } from "@/services/api/telematics";

const FRESH_STYLE: Record<VehicleTelemetry["freshness"], { label: string; dot: string; chip: string }> = {
  live: { label: "Live", dot: "bg-success", chip: "border-success/40 bg-success/10 text-success" },
  stale: { label: "Stale", dot: "bg-warning", chip: "border-warning/40 bg-warning/10 text-warning" },
  offline: { label: "Offline", dot: "bg-muted-foreground", chip: "border-border bg-muted text-muted-foreground" },
};

/** One scooter on a small map; re-centres when a new position arrives. */
function ScooterMiniMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const theme = useUiStore((s) => s.theme);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const pos = useRef({ lat, lng });
  pos.current = { lat, lng };

  useEffect(() => {
    if (!isMapConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [lib] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
        if (cancelled || !containerRef.current) return;
        const map = new lib.Map({
          container: containerRef.current,
          style: mapStyleForTheme(themeRef.current),
          center: [pos.current.lng, pos.current.lat],
          zoom: 15,
          attributionControl: { compact: true },
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.on("style.load", () => { if (themeRef.current === "dark") tuneDarkMapLabels(map); });
        markerRef.current = new lib.Marker({ color: "#21C45D" }).setLngLat([pos.current.lng, pos.current.lat]).addTo(map);
        mapRef.current = map;
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      markerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    markerRef.current?.setLngLat([lng, lat]);
    mapRef.current?.easeTo({ center: [lng, lat], duration: 600 });
  }, [lat, lng, status]);

  useEffect(() => {
    if (status === "ready") mapRef.current?.setStyle(mapStyleForTheme(theme));
  }, [theme, status]);

  if (!isMapConfigured() || status === "failed") {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-secondary/40 text-center">
        <MapPinOff className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {isMapConfigured() ? "The map failed to load." : "Set VITE_MAP_STYLE_URL to show the map."}
        </p>
      </div>
    );
  }
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon, label, value, sub, tone,
}: { icon: typeof Gauge; label: string; value: string; sub?: string; tone?: "bad" | "warn" | "good" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-warning",
          tone === "good" && "text-success",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[0.6875rem] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const fmt = (n: number | null, digits = 0, unit = "") => (n === null ? "—" : `${n.toFixed(digits)}${unit}`);

/**
 * Live card for the vehicle detail page: where the scooter is, how charged it
 * is, and whether it is reporting at all. Admin console only; reads the latest
 * stored reading (refreshed by the sync job every 5 minutes).
 */
export function VehicleLiveCard({ vehicleId, registrationNumber }: { vehicleId: string; registrationNumber: string }) {
  const { data, isLoading, isError } = useVehicleTelemetry(vehicleId);
  const t = data?.telemetry ?? null;
  // Remote control is admin-only — the server enforces it; this just hides the buttons.
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [controlAction, setControlAction] = useState<"immobilise" | "mobilise" | null>(null);
  const commands = useControlCommands(vehicleId, isAdmin);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-4 w-4" /> Live tracking
        </CardTitle>
        {t ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              FRESH_STYLE[t.freshness].chip,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", FRESH_STYLE[t.freshness].dot)} />
            {FRESH_STYLE[t.freshness].label}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load the live data.</p>
        ) : !t ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No reading yet. The first one arrives within a few minutes of the tracking sync being switched on for this
            scooter.
          </p>
        ) : (
          <>
            {t.lat !== null && t.lng !== null ? (
              <ScooterMiniMap lat={t.lat} lng={t.lng} />
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No GPS position reported yet.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                icon={BatteryMedium}
                label="Battery"
                value={fmt(t.soc_percent, 0, "%")}
                sub={t.can_at ? timeAgo(t.can_at) : "no battery feed"}
                tone={t.soc_percent === null ? undefined : t.soc_percent < 15 ? "bad" : t.soc_percent < 30 ? "warn" : "good"}
              />
              <Metric icon={Gauge} label="Speed" value={fmt(t.speed_kmph, 0, " km/h")} sub={t.ignition_on === null ? undefined : t.ignition_on ? "Ignition on" : "Ignition off"} />
              <Metric
                icon={KeyRound}
                label="Immobiliser"
                value={t.immobilised === null ? "—" : t.immobilised ? "Immobilised" : "Mobilised"}
                tone={t.immobilised ? "bad" : undefined}
              />
              <Metric icon={Thermometer} label="Battery temp" value={fmt(t.battery_temp_c, 1, " °C")} />
              <Metric icon={Route} label="Odometer" value={t.odometer_km === null ? "—" : `${t.odometer_km.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`} sub="total distance" />
              <Metric icon={Zap} label="Pack voltage" value={fmt(t.battery_voltage, 1, " V")} sub={t.battery_current_a === null ? undefined : `${t.battery_current_a.toFixed(1)} A`} />
              <Metric icon={Zap} label="Tracker battery" value={fmt(t.device_battery_v, 1, " V")} />
              <Metric icon={Zap} label="Vehicle battery" value={fmt(t.vehicle_battery_v, 1, " V")} />
              <Metric
                icon={Radio}
                label="Last position"
                value={t.gps_at ? timeAgo(t.gps_at) : "—"}
                sub={t.gps_at ? formatFullDateTime(t.gps_at) : undefined}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Synced {timeAgo(t.synced_at)} · refreshes every 5 min</span>
              {t.lat !== null && t.lng !== null ? (
                <a
                  className="inline-flex items-center gap-1 underline"
                  href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>

            {isAdmin ? (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Remote control <span className="font-normal text-muted-foreground">· admin only</span></p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setControlAction("immobilise")} disabled={t.immobilised === true}>
                      <Lock className="h-3.5 w-3.5" /> Immobilise
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setControlAction("mobilise")} disabled={t.immobilised === false}>
                      <LockOpen className="h-3.5 w-3.5" /> Mobilise
                    </Button>
                  </div>
                </div>
                {(commands.data ?? []).length > 0 ? (
                  <ul className="space-y-1.5">
                    {(commands.data ?? []).slice(0, 5).map((c) => (
                      <li key={c.id} className="rounded-md border border-border px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium capitalize">
                            {c.action} · {c.status === "failed" ? <span className="text-destructive">failed</span> : "sent"}
                          </span>
                          <span className="text-muted-foreground">{formatFullDateTime(c.created_at)}</span>
                        </div>
                        <p className="text-muted-foreground">
                          {c.requested_by?.full_name ?? "Admin"} — {c.reason}
                          {c.error ? ` (${c.error})` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {controlAction ? (
                  <VehicleControlDialog
                    open
                    onOpenChange={(o) => !o && setControlAction(null)}
                    vehicleId={vehicleId}
                    registrationNumber={registrationNumber}
                    action={controlAction}
                    speedKmph={t.freshness === "live" ? t.speed_kmph : null}
                  />
                ) : null}
              </div>
            ) : null}

            {t.sync_error ? (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                Last sync issue: {t.sync_error}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
