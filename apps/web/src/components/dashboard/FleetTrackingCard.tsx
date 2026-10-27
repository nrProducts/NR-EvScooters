import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleetTelemetry } from "@/hooks/useTelematics";
import { summariseFleet } from "@/services/api/telematics";
import { cn } from "@/lib/utils";

/**
 * Dashboard summary of live tracking — how many scooters are reporting, how
 * many have gone quiet, and how many are low on charge — with a link to the
 * Live Map. Renders nothing at all until a first reading exists, so a fleet
 * that has not switched tracking on sees no empty card.
 */
export function FleetTrackingCard() {
  const { data, isLoading } = useFleetTelemetry();
  const stats = useMemo(() => summariseFleet(data ?? []), [data]);

  if (!isLoading && stats.total === 0) return null;

  const tiles: { label: string; value: number; tone?: string }[] = [
    { label: "Live", value: stats.live, tone: "text-success" },
    { label: "Offline", value: stats.offline + stats.stale, tone: stats.offline + stats.stale > 0 ? "text-warning" : undefined },
    { label: "Low battery", value: stats.lowBattery, tone: stats.lowBattery > 0 ? "text-destructive" : undefined },
    { label: "Immobilised", value: stats.immobilised },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between p-3 pb-1.5">
        <CardTitle className="flex items-center gap-1.5 text-xs">
          <Radio className="h-3.5 w-3.5" /> Fleet tracking
        </CardTitle>
        <Link to="/live-map" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          Live map <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg border border-border p-2 text-center">
                <p className={cn("text-lg font-semibold tabular-nums", t.tone)}>{t.value}</p>
                <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">{t.label}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
