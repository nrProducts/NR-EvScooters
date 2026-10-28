import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleetTelemetry } from "@/hooks/useTelematics";
import { summariseFleet } from "@/services/api/telematics";
import { cn } from "@/lib/utils";

/**
 * Dashboard summary of live tracking — how many scooters are reporting, how
 * many have gone quiet, how many are low on charge — with a link to the Live Map.
 * Four tinted tiles in a 2×2 block that share the card's height, so the card is
 * full at any height the row gives it. A tile only takes its warning colour while
 * it is above zero; at zero it goes neutral rather than alarming for nothing.
 * Renders nothing at all until a first reading exists, so a fleet that has not
 * switched tracking on sees no empty card.
 */
export function FleetTrackingCard({ className }: { className?: string }) {
  const { data, isLoading } = useFleetTelemetry();
  const stats = useMemo(() => summariseFleet(data ?? []), [data]);

  if (!isLoading && stats.total === 0) return null;

  const quiet = stats.offline + stats.stale;
  const tiles: { label: string; value: number; dot: string; bg: string; num: string }[] = [
    { label: "Live", value: stats.live, dot: "bg-success", bg: "bg-success/10", num: "text-success" },
    { label: "Offline", value: quiet, dot: quiet > 0 ? "bg-warning" : "bg-muted-foreground/40", bg: quiet > 0 ? "bg-warning/10" : "bg-muted/60", num: quiet > 0 ? "text-warning" : "" },
    { label: "Low battery", value: stats.lowBattery, dot: stats.lowBattery > 0 ? "bg-destructive" : "bg-muted-foreground/40", bg: stats.lowBattery > 0 ? "bg-destructive/10" : "bg-muted/60", num: stats.lowBattery > 0 ? "text-destructive" : "" },
    { label: "Immobilised", value: stats.immobilised, dot: "bg-muted-foreground/40", bg: "bg-muted/60", num: "" },
  ];

  return (
    <Card className={cn("flex flex-col p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Radio className="h-3.5 w-3.5 text-primary" /> Fleet tracking
          {!isLoading ? <span className="font-normal text-muted-foreground">· {stats.total}</span> : null}
        </h3>
        <Link to="/live-map" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Live map <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="mt-3 w-full flex-1" />
      ) : (
        <div className="mt-3 grid flex-1 grid-cols-2 grid-rows-2 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className={cn("flex items-center justify-between gap-2 rounded-xl px-3", t.bg)}>
              <span className="flex min-w-0 items-center gap-2 text-[0.6875rem] text-muted-foreground">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} />
                <span className="truncate">{t.label}</span>
              </span>
              <span className={cn("text-lg font-semibold tabular-nums", t.num)}>{t.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
