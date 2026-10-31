import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BatteryLow, Radio, Route, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBikeKms, useFleetTelemetry } from "@/hooks/useTelematics";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn, timeAgo } from "@/lib/utils";
import { isLowBattery, summariseFleet, type VehicleTelemetryListItem } from "@/services/api/telematics";
import { TrackingStatusPanel } from "@/components/fleet/TrackingStatusPanel";
import { FleetLiveMap, PIN_COLOR, hasPosition, pinColorFor } from "@/components/fleet/FleetLiveMap";

type Filter = "all" | "live" | "stale" | "offline" | "low";

/**
 * The five tiles are the filter AND the legend: each shows its map colour, its count
 * and what the colour means, so nothing has to be looked up in a separate key.
 */
const TILES: { key: Filter; label: string; hint: string; color: string }[] = [
  { key: "all", label: "All scooters", hint: "Every tracked bike", color: "#21C45D" },
  { key: "live", label: "Live", hint: "Reported in the last 15 min", color: PIN_COLOR.live },
  { key: "stale", label: "Stale", hint: "Last report 15 min – 6 h ago", color: PIN_COLOR.stale },
  { key: "offline", label: "Offline", hint: "Nothing for over 6 h", color: PIN_COLOR.offline },
  { key: "low", label: "Low battery", hint: "Charge below 15%", color: PIN_COLOR.low },
];

const matches = (t: VehicleTelemetryListItem, f: Filter) =>
  f === "all" ? true : f === "low" ? isLowBattery(t) : t.freshness === f;

/** The battery bar's fill: brand green when healthy, amber under 40%, red when low. */
const batteryFill = (soc: number) =>
  soc < 15 ? "#DC2626" : soc < 40 ? "#F59E0B" : "linear-gradient(90deg, #3CCB73, #17924A)";

/** One height for the map card and the list beside it, so the two line up edge to edge. */
const PANEL_HEIGHT = "h-[calc(100vh-21rem)] min-h-[30rem]";

/**
 * Every scooter on one map, from the latest stored reading (refreshed every
 * 5 minutes by the sync job). Admin console only.
 */
export default function LiveMapPage() {
  const { data, isLoading, isError } = useFleetTelemetry();
  const { data: bikeKms } = useBikeKms();
  const kmToday = useMemo(() => new Map((bikeKms ?? []).map((b) => [b.vehicle.id, b.km_today])), [bikeKms]);
  const [filter, setFilter] = useState<Filter>("all");
  const [focusId, setFocusId] = useState<string | null>(null);

  const all = useMemo(() => data ?? [], [data]);
  const stats = useMemo(() => summariseFleet(all), [all]);
  const visible = useMemo(() => all.filter((t) => matches(t, filter)), [all, filter]);

  usePageSubtitle(
    `${stats.total} tracked · ${stats.live} live · ${stats.offline} offline${stats.lowBattery ? ` · ${stats.lowBattery} low battery` : ""}`,
  );

  // Lowest battery first — the ones that need a person soonest.
  const list = useMemo(
    () => [...visible].sort((a, b) => (a.soc_percent ?? 101) - (b.soc_percent ?? 101)),
    [visible],
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
        {TILES.map((tile) => {
          const count = tile.key === "all" ? stats.total : tile.key === "low" ? stats.lowBattery : stats[tile.key];
          const active = filter === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(tile.key)}
              className={cn(
                "flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl bg-card p-3.5 text-left shadow-card outline-none transition-smooth focus-visible:ring-2 focus-visible:ring-ring",
                !active && "hover:-translate-y-0.5",
              )}
              // An INSET outline: it is drawn inside the tile, so the scrolling page can never clip it at the edges.
              style={active ? { boxShadow: `inset 0 0 0 2px ${tile.color}, var(--shadow-card)` } : undefined}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tile.color}22` }}>
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: tile.color }} />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-bold leading-none tabular-nums">{count}</span>
                <span className="mt-1 block truncate text-xs font-semibold">{tile.label}</span>
                <span className="block truncate text-[0.6875rem] text-muted-foreground" title={tile.hint}>{tile.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* The map sits in its own white frame. */}
        <Card className={cn("overflow-hidden p-2.5 lg:col-span-2", PANEL_HEIGHT)}>
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : isError ? (
            <p className="p-4 text-sm text-destructive">Couldn&apos;t load the live data.</p>
          ) : (
            <FleetLiveMap items={visible} focusId={focusId} kmToday={kmToday} heightClassName="h-full" />
          )}
        </Card>

        <Card className={cn("flex flex-col overflow-hidden", PANEL_HEIGHT)}>
          <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Scooters <span className="font-normal text-muted-foreground">· {list.length}</span></span>
            <span className="text-[0.6875rem] text-muted-foreground">lowest battery first</span>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <li className="p-4"><Skeleton className="h-10 w-full" /></li>
            ) : list.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                {all.length === 0
                  ? "No readings yet. Scooters appear a few minutes after the tracking sync is switched on."
                  : "No scooters match this filter."}
              </li>
            ) : list.map((t) => {
              const soc = t.soc_percent === null ? null : Math.round(t.soc_percent);
              return (
                <li key={t.vehicle_id}>
                  <button
                    type="button"
                    onClick={() => setFocusId(t.vehicle_id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50",
                      focusId === t.vehicle_id && "bg-primary/5",
                    )}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-card" style={{ background: pinColorFor(t), boxShadow: `0 0 0 4px ${pinColorFor(t)}22` }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.vehicle.name ?? t.vehicle.registration_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.vehicle.registration_number} · {t.gps_at ? timeAgo(t.gps_at) : "never reported"}
                        {kmToday.has(t.vehicle_id) ? ` · ${kmToday.get(t.vehicle_id)} km today` : ""}
                        {!hasPosition(t) ? " · no position" : ""}
                      </p>
                    </div>
                    <div className="flex w-16 shrink-0 flex-col items-end gap-1">
                      <span className="flex items-center gap-1">
                        {t.freshness === "offline" ? (
                          <WifiOff className="h-3 w-3 text-muted-foreground" />
                        ) : isLowBattery(t) ? (
                          <BatteryLow className="h-3 w-3 text-destructive" />
                        ) : (
                          <Radio className="h-3 w-3 text-success" />
                        )}
                        <span className={cn("text-sm font-semibold tabular-nums", isLowBattery(t) && "text-destructive")}>
                          {soc === null ? "—" : `${soc}%`}
                        </span>
                      </span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        {soc !== null ? <span className="block h-full rounded-full" style={{ width: `${Math.max(4, soc)}%`, background: batteryFill(soc) }} /> : null}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* How fresh the data is, with its Refresh buttons: a slim strip now, not a card of its own. */}
      <TrackingStatusPanel variant="compact" />

      <div className="flex justify-end">
        <Link to="/vehicles?view=kms" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <Route className="h-4 w-4" /> Bike KMs — distance for every scooter <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
