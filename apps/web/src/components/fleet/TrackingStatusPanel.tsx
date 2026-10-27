import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/common/Spinner";
import { useRefreshTracking, useTrackingStatus } from "@/hooks/useTelematics";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { useAuthStore } from "@/store/authStore";
import { formatFullDateTime, timeAgo } from "@/lib/utils";
import type { TrackingFeedStatus } from "@/services/api/telematics";

type Kind = "live" | "distance";

/** The next scheduled distance run: 5 minutes past every even UTC hour. */
export function nextDistanceRun(now: number = Date.now()): Date {
  const d = new Date(now);
  d.setUTCMinutes(5, 0, 0); // this hour's :05
  // step forward hour by hour until it is in the future and on an even UTC hour
  while (d.getTime() <= now || d.getUTCHours() % 2 !== 0) d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

/** The next scheduled live run: the next 5-minute mark. */
function nextLiveRun(now: number = Date.now()): Date {
  return new Date(Math.ceil((now + 1) / 300_000) * 300_000);
}

const hhmm = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

/**
 * What refreshes how often, when each feed last updated, and (for admins) a
 * "Refresh now" for each. Shown on the Live Map page and in the Vehicles screen's Bike KMs view.
 *
 * The manual refresh starts the sync in the background — it can take up to a
 * minute — so after pressing, the panel polls quickly until "last updated"
 * moves, then reloads the screen's data.
 */
export function TrackingStatusPanel() {
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const qc = useQueryClient();
  const [watching, setWatching] = useState<{ kind: Kind; baseline: string | null; until: number } | null>(null);
  const status = useTrackingStatus(!!watching);
  const refresh = useRefreshTracking();
  const watchingRef = useRef(watching);
  watchingRef.current = watching;

  // Stop watching once the feed's "last updated" has moved (or after 2 minutes).
  useEffect(() => {
    const w = watchingRef.current;
    if (!w || !status.data) return;
    const current = status.data[w.kind].last_updated_at;
    if (current !== w.baseline || Date.now() > w.until) {
      setWatching(null);
      void qc.invalidateQueries({ queryKey: ["fleet-telemetry"] });
      void qc.invalidateQueries({ queryKey: ["bike-kms"] });
      if (current !== w.baseline) toastSuccess(w.kind === "live" ? "Live data refreshed" : "Daily kilometres refreshed");
    }
  }, [status.data, qc]);

  const press = (kind: Kind) => {
    const baseline = status.data?.[kind].last_updated_at ?? null;
    refresh.mutate(kind, {
      onSuccess: () => setWatching({ kind, baseline, until: Date.now() + 120_000 }),
      onError: (err) => toastError(err, "Could not start the refresh"),
    });
  };

  const s = status.data;

  const row = (
    kind: Kind,
    title: string,
    covers: string,
    schedule: string,
    next: Date,
    feed: TrackingFeedStatus | undefined,
    extra?: string,
  ) => {
    const busy = watching?.kind === kind || (refresh.isPending && refresh.variables === kind);
    const blockedReason = feed && !feed.can_refresh ? feed.reason : null;
    return (
      <div className="grid gap-x-6 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 md:grid-cols-[1.2fr_1.4fr_1.6fr_auto] md:items-center">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{covers}</p>
        </div>
        <div className="text-sm">
          <p>{schedule}</p>
          <p className="text-xs text-muted-foreground">Next ≈ {hhmm(next)}</p>
        </div>
        <div className="text-sm">
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {feed?.last_updated_at ? formatFullDateTime(feed.last_updated_at) : status.isLoading ? "…" : "Never"}
          </p>
          <p className="text-xs text-muted-foreground">
            {feed?.last_updated_at ? timeAgo(feed.last_updated_at) : "No data stored yet"}
            {extra ? ` · ${extra}` : ""}
          </p>
        </div>
        {isAdmin ? (
          <div className="md:text-right">
            <Button
              size="sm"
              variant="outline"
              disabled={!feed || !feed.can_refresh || busy}
              title={blockedReason ?? undefined}
              onClick={() => press(kind)}
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {busy ? "Refreshing…" : "Refresh now"}
            </Button>
            {blockedReason && !busy ? (
              <p className="mt-1 max-w-[16rem] text-[0.6875rem] text-muted-foreground md:ml-auto">{blockedReason}</p>
            ) : null}
            {busy ? <p className="mt-1 text-[0.6875rem] text-muted-foreground">Takes up to a minute.</p> : null}
          </div>
        ) : <div />}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <p className="text-sm font-semibold">Tracking data refresh</p>
        <p className="hidden text-xs text-muted-foreground sm:block">From the bikes&apos; trackers via Intellicar</p>
      </div>
      {row(
        "live",
        "Live data",
        "Position, battery, odometer (total km), last seen",
        "Every 5 minutes",
        nextLiveRun(),
        s?.live,
      )}
      {row(
        "distance",
        "Daily kilometres",
        "Today / last 7 days / last 30 days",
        "Every 2 hours (5 min past each even UTC hour)",
        nextDistanceRun(),
        s?.distance,
        s ? `${s.distance.manual_runs_today} of ${s.distance.manual_cap} manual refreshes used today` : undefined,
      )}
    </Card>
  );
}
