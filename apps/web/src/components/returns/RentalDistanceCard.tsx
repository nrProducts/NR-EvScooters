import { Route } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRentalDistance } from "@/hooks/useTelematics";
import { formatFullDateTime } from "@/lib/utils";

const km = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;

/**
 * How far the scooter went during this rental, from the tracker's odometer —
 * not a rider-entered or estimated figure. A rental that used two scooters
 * (a maintenance swap) lists each one. Admin console only.
 */
export function RentalDistanceCard({ rentalId }: { rentalId: string }) {
  const { data, isLoading, isError } = useRentalDistance(rentalId);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Route className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Distance travelled</p>
            {isLoading ? (
              <Skeleton className="mt-1 h-6 w-24" />
            ) : isError ? (
              <p className="text-sm text-destructive">Couldn&apos;t load</p>
            ) : data?.available ? (
              <p className="text-xl font-semibold tabular-nums">{km(data.distance_km)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{data?.message ?? "Not available"}</p>
            )}
          </div>
        </div>

        {data?.available ? (
          <>
            {data.start_odo !== null && data.end_odo !== null ? (
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Odometer</p>
                <p className="tabular-nums">
                  {km(data.start_odo)} → {km(data.end_odo)}
                </p>
              </div>
            ) : null}

            {data.segments.length > 1 ? (
              <div className="text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">By scooter</p>
                {data.segments.map((s) => (
                  <p key={`${s.registration_number}-${s.from}`} className="tabular-nums">
                    {s.registration_number}: {s.distance_km === null ? "—" : km(s.distance_km)}
                  </p>
                ))}
              </div>
            ) : null}

            <p className="ml-auto text-xs text-muted-foreground">
              {data.is_final ? "Final" : "Running — updates about every 2 hours"} · from the tracker, checked{" "}
              {formatFullDateTime(data.computed_at)}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
