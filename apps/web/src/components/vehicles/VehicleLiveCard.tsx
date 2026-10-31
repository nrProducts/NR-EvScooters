import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { ChevronDown, ExternalLink, KeyRound, Lock, LockKeyhole, LockKeyholeOpen, LockOpen, MapPinOff, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/common/Spinner";
import { VehicleControlDialog } from "@/components/vehicles/VehicleControlDialog";
import { useControlCommands, useLockState, useVehicleTelemetry } from "@/hooks/useTelematics";
import { isMapConfigured, mapStyleForTheme, tuneDarkMapLabels } from "@/lib/mapConfig";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { cn, formatFullDateTime, timeAgo } from "@/lib/utils";
import type { ControlAction, VehicleTelemetry } from "@/services/api/telematics";

const FRESH_STYLE: Record<VehicleTelemetry["freshness"], { label: string; dot: string; chip: string }> = {
  live: { label: "Live", dot: "bg-success", chip: "border-success/40 bg-success/10 text-success" },
  stale: { label: "Stale", dot: "bg-warning", chip: "border-warning/40 bg-warning/10 text-warning" },
  offline: { label: "Offline", dot: "bg-muted-foreground", chip: "border-border bg-muted text-muted-foreground" },
};

/** One scooter on a map; re-centres when a new position arrives. */
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
      <div className="flex h-96 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-secondary/40 text-center">
        <MapPinOff className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {isMapConfigured() ? "The map failed to load." : "Set VITE_MAP_STYLE_URL to show the map."}
        </p>
      </div>
    );
  }
  return (
    // Fixed height on the wrapper, and a normal-flow (h-full) map container:
    // MapLibre's own CSS forces its container to `position: relative`, which
    // overrides any `absolute inset-0` and collapses the map to zero height.
    <div className="relative h-96 w-full overflow-hidden rounded-xl border border-border">
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
          <Spinner className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <a
        className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium shadow-soft hover:bg-card"
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in Google Maps <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

const km1 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const fmt = (n: number | null, digits = 1) => (n === null ? "—" : n.toFixed(digits));

function Chip({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone === "good" && "border-success/40 bg-success/10 text-success",
        tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "muted" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** One supporting reading: small label above, value below — laid out across the full width. */
function Reading({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : <p className="text-xs">&nbsp;</p>}
    </div>
  );
}

function BatteryTile({ t }: { t: VehicleTelemetry }) {
  const soc = t.soc_percent;
  const level = soc === null ? "none" : soc < 15 ? "low" : soc < 30 ? "mid" : "ok";
  return (
    <div className="rounded-xl border border-border p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Battery</p>
        {level === "low" ? <Chip tone="bad">Low</Chip> : null}
      </div>
      <p
        className={cn(
          "mt-2 text-6xl font-semibold leading-none tabular-nums",
          level === "low" && "text-destructive",
          level === "mid" && "text-warning",
        )}
      >
        {soc === null ? "—" : Math.round(soc)}
        {soc !== null ? <span className="ml-1 text-2xl font-medium text-muted-foreground">%</span> : null}
      </p>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={soc === null ? "No battery reading" : `Battery ${Math.round(soc)} percent`}>
        <div
          className={cn(
            "h-full rounded-full transition-all",
            level === "low" ? "bg-destructive" : level === "mid" ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${Math.max(0, Math.min(100, soc ?? 0))}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {t.can_at ? `Battery reported ${timeAgo(t.can_at)}` : "No battery feed from this scooter"}
      </p>
    </div>
  );
}

/**
 * Live tracking for one scooter (vehicle detail page): the map, then the three
 * things staff actually look at — battery, speed, total km — then the
 * supporting readings, then (admins only) remote control in its own fenced-off
 * block. Reads the latest stored reading, refreshed every 5 minutes.
 */
export function VehicleLiveCard({ vehicleId, registrationNumber }: { vehicleId: string; registrationNumber: string }) {
  const { data, isLoading, isError } = useVehicleTelemetry(vehicleId);
  const t = data?.telemetry ?? null;
  // Remote control is admin-only — the server enforces it; this just hides the buttons.
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [controlAction, setControlAction] = useState<ControlAction | null>(null);
  const commands = useControlCommands(vehicleId, isAdmin);
  const history = commands.data ?? [];
  const lock = useLockState(vehicleId, isAdmin).data;

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Radio className="h-4 w-4 text-muted-foreground" /> Live tracking
          </h3>
          {t ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.gps_at ? `Position ${timeAgo(t.gps_at)} · ${formatFullDateTime(t.gps_at)}` : "No position reported yet"}
            </p>
          ) : null}
        </div>
        {t ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">Synced {timeAgo(t.synced_at)} · every 5 min</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", FRESH_STYLE[t.freshness].chip)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", FRESH_STYLE[t.freshness].dot)} />
              {FRESH_STYLE[t.freshness].label}
            </span>
          </div>
        ) : null}
      </div>

      <div className="space-y-5 p-5">
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-12">
            <Skeleton className="h-96 w-full lg:col-span-7" />
            <Skeleton className="h-96 w-full lg:col-span-5" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load the live data.</p>
        ) : !t ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No reading yet. The first one arrives within a few minutes of tracking being switched on for this scooter.
          </p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-12">
              {/* Map */}
              <div className="lg:col-span-7">
                {t.lat !== null && t.lng !== null ? (
                  <ScooterMiniMap lat={t.lat} lng={t.lng} />
                ) : (
                  <div className="flex h-96 items-center justify-center rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No GPS position reported yet.
                  </div>
                )}
              </div>

              {/* The three headline numbers */}
              <div className="flex flex-col gap-3 lg:col-span-5 lg:h-96 lg:justify-between">
                <BatteryTile t={t} />

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Speed</p>
                    <p className="mt-2 text-4xl font-semibold leading-none tabular-nums">
                      {t.speed_kmph === null ? "—" : Math.round(t.speed_kmph)}
                      <span className="ml-1.5 text-base font-medium text-muted-foreground">km/h</span>
                    </p>
                    <div className="mt-2">
                      {t.ignition_on === null ? null : (
                        <Chip tone={t.ignition_on ? "good" : "muted"}>Ignition {t.ignition_on ? "on" : "off"}</Chip>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Odometer</p>
                    <p className="mt-2 text-4xl font-semibold leading-none tabular-nums">
                      {t.odometer_km === null ? "—" : km1(t.odometer_km)}
                      {t.odometer_km !== null ? <span className="ml-1.5 text-base font-medium text-muted-foreground">km</span> : null}
                    </p>
                    <p className="mt-3 text-sm text-muted-foreground">Total distance</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border px-5 py-4">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <KeyRound className="h-4 w-4" /> Immobiliser
                  </span>
                  {t.immobilised === null ? (
                    <Chip tone="muted">Unknown</Chip>
                  ) : t.immobilised ? (
                    <Chip tone="bad"><Lock className="h-3 w-3" /> Immobilised</Chip>
                  ) : (
                    <Chip tone="good"><LockOpen className="h-3 w-3" /> Mobilised</Chip>
                  )}
                </div>
              </div>
            </div>

            {/* Supporting readings — one row across the full width */}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Readings</p>
              <div className="grid grid-cols-2 divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-x [&>*]:border-b [&>*]:border-border lg:[&>*]:border-b-0">
                <Reading label="Battery temperature" value={t.battery_temp_c === null ? "—" : `${fmt(t.battery_temp_c)} °C`} hint="hottest cell" />
                <Reading
                  label="Pack voltage"
                  value={t.battery_voltage === null ? "—" : `${fmt(t.battery_voltage)} V`}
                  hint={t.battery_current_a === null ? undefined : `${fmt(t.battery_current_a)} A current`}
                />
                <Reading label="Tracker battery" value={t.device_battery_v === null ? "—" : `${fmt(t.device_battery_v)} V`} hint="GPS device" />
                <Reading label="Vehicle battery" value={t.vehicle_battery_v === null ? "—" : `${fmt(t.vehicle_battery_v)} V`} hint="12 V system" />
                <Reading label="Position" value={t.lat !== null && t.lng !== null ? `${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}` : "—"} hint="latitude, longitude" />
                <Reading label="Last synced" value={timeAgo(t.synced_at)} hint={formatFullDateTime(t.synced_at)} />
              </div>
            </div>

            {t.sync_error ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">Last sync issue: {t.sync_error}</p>
            ) : null}

            {/* Remote control — admins only, fenced off from the readings above */}
            {isAdmin ? (
              <div className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Remote control</p>
                    <p className="text-xs text-muted-foreground">
                      Admin only. Immobilising cuts the scooter&apos;s drive until you mobilise it again.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setControlAction("immobilise")} disabled={t.immobilised === true}>
                      <Lock className="h-3.5 w-3.5" /> Immobilise
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setControlAction("mobilise")} disabled={t.immobilised === false}>
                      <LockOpen className="h-3.5 w-3.5" /> Mobilise
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setControlAction("lock")} disabled={lock?.state === "locked"}>
                      <LockKeyhole className="h-3.5 w-3.5" /> Lock
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setControlAction("unlock")} disabled={lock?.state === "unlocked"}>
                      <LockKeyholeOpen className="h-3.5 w-3.5" /> Unlock
                    </Button>
                  </div>
                </div>

                {/* The platform cannot read the lock back, so this is the last command we sent. */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-destructive/15 pt-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LockKeyhole className="h-4 w-4" /> Lock
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {!lock || lock.state === "unknown" ? (
                      <Chip tone="muted">Unknown — no lock command sent yet</Chip>
                    ) : lock.state === "locked" ? (
                      <Chip tone="bad"><LockKeyhole className="h-3 w-3" /> Locked</Chip>
                    ) : (
                      <Chip tone="good"><LockKeyholeOpen className="h-3 w-3" /> Unlocked</Chip>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {lock?.at
                        ? `Last command ${timeAgo(lock.at)}${lock.by ? ` by ${lock.by}` : ""} · not confirmed by the scooter`
                        : "The scooter does not report its lock"}
                    </span>
                  </div>
                </div>

                {history.length > 0 ? (
                  <details className="group mt-3 border-t border-destructive/15 pt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium [&::-webkit-details-marker]:hidden">
                      Recent commands ({history.length})
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {history.slice(0, 5).map((c) => (
                        <li key={c.id} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
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
                  </details>
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
          </>
        )}
      </div>
    </Card>
  );
}
