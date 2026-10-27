import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BatteryLow, Radio, Route, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBikeKms, useFleetTelemetry } from "@/hooks/useTelematics";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn, timeAgo } from "@/lib/utils";
import { isLowBattery, summariseFleet, type VehicleTelemetryListItem } from "@/services/api/telematics";
import { TrackingStatusPanel } from "@/components/fleet/TrackingStatusPanel";
import { FleetLiveMap, PIN_COLOR, hasPosition, pinColorFor } from "@/components/fleet/FleetLiveMap";

type Filter = "all" | "live" | "stale" | "offline" | "low";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "stale", label: "Stale" },
  { key: "offline", label: "Offline" },
  { key: "low", label: "Low battery" },
];

const matches = (t: VehicleTelemetryListItem, f: Filter) =>
  f === "all" ? true : f === "low" ? isLowBattery(t) : t.freshness === f;

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
      <TrackingStatusPanel />

      <div className="flex flex-wrap items-center gap-2">
        <Link to="/vehicles?view=kms"className="order-last ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/50">
          <Route className="h-4 w-4" /> Bike KMs
        </Link>
        {FILTERS.map((f) => {
          const count = f.key === "all" ? stats.total : f.key === "low" ? stats.lowBattery : stats[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-smooth",
                filter === f.key
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label} <span className="ml-1 tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-[34rem] w-full rounded-xl" />
          ) : isError ? (
            <p className="text-sm text-destructive">Couldn&apos;t load the live data.</p>
          ) : (
            <FleetLiveMap items={visible} focusId={focusId} kmToday={kmToday} />
          )}
        </div>

        <Card className="flex max-h-[34rem] flex-col overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            Scooters <span className="font-normal text-muted-foreground">· lowest battery first</span>
          </div>
          <ul className="flex-1 divide-y divide-border overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <li className="p-4"><Skeleton className="h-10 w-full" /></li>
            ) : list.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                {all.length === 0
                  ? "No readings yet. Scooters appear a few minutes after the tracking sync is switched on."
                  : "No scooters match this filter."}
              </li>
            ) : list.map((t) => (
              <li key={t.vehicle_id}>
                <button
                  type="button"
                  onClick={() => setFocusId(t.vehicle_id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50",
                    focusId === t.vehicle_id && "bg-muted/60",
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pinColorFor(t) }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.vehicle.name ?? t.vehicle.registration_number}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.vehicle.registration_number} · {t.gps_at ? timeAgo(t.gps_at) : "never reported"}
                      {kmToday.has(t.vehicle_id) ? ` · ${kmToday.get(t.vehicle_id)} km today` : ""}
                      {!hasPosition(t) ? " · no position" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-sm font-semibold tabular-nums", isLowBattery(t) && "text-destructive")}>
                      {t.soc_percent === null ? "—" : `${Math.round(t.soc_percent)}%`}
                    </p>
                    {t.freshness === "offline" ? (
                      <WifiOff className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                    ) : isLowBattery(t) ? (
                      <BatteryLow className="ml-auto h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <Radio className="ml-auto h-3.5 w-3.5 text-success" />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {([["Live (≤15 min)", PIN_COLOR.live], ["Stale", PIN_COLOR.stale], ["Offline (>6 h)", PIN_COLOR.offline], [`Low battery (<15%)`, PIN_COLOR.low]] as const).map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}
