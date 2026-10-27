import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gauge, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FleetAllowanceDialog } from "@/components/fleet/FleetAllowanceDialog";
import { useFleetAllowance } from "@/hooks/useFleetAllowance";
import { useAuthStore } from "@/store/authStore";
import { cn, formatDate } from "@/lib/utils";

const km = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} km`;
const kmShort = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

/**
 * How much of the month's kilometre allowance the fleet has used, against the
 * fleet limit (per-bike limit × number of bikes). On the dashboard it links to
 * the per-bike detail in Vehicles → Bike KMs; admins can edit the limit and the
 * month's dates from here.
 */
export function FleetAllowanceCard({ variant = "dashboard" }: { variant?: "dashboard" | "page" }) {
  const { data, isLoading, isError } = useFleetAllowance();
  const isAdmin = useAuthStore((s) => s.user?.role === "admin");
  const [editOpen, setEditOpen] = useState(false);

  const t = data?.totals;
  const s = data?.settings;
  const percent = t?.percent_used ?? 0;
  const tone = percent >= 100 ? "bad" : percent >= 85 ? "warn" : "ok";
  const paceMarker = t && t.period_status === "running" && t.days_total > 0 ? (t.days_elapsed / t.days_total) * 100 : null;
  const overBy = t && t.period_status === "running" && t.projected_km > t.fleet_limit_km ? t.projected_km - t.fleet_limit_km : 0;

  const periodLabel = s ? `${formatDate(s.period_start)} – ${formatDate(s.period_end)}` : "";
  const periodNote = !t ? "" : t.period_status === "upcoming" ? "Starts soon"
    : t.period_status === "ended" ? "Period ended"
      : `${t.days_left} day${t.days_left === 1 ? "" : "s"} left`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-muted-foreground" /> Fleet kilometre allowance
          </h3>
          {s ? <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel} · {periodNote}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          {isAdmin ? (
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} disabled={!data}>
              <Settings2 className="h-3.5 w-3.5" /> Edit limit &amp; month
            </Button>
          ) : null}
          {variant === "dashboard" ? (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/vehicles?view=kms">
                Per-bike details <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : isError || !t || !s ? (
          <p className="text-sm text-muted-foreground">The kilometre allowance is not available yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <p className="tabular-nums">
                <span
                  className={cn(
                    "text-4xl font-semibold leading-none",
                    tone === "bad" && "text-destructive",
                    tone === "warn" && "text-warning",
                  )}
                >
                  {kmShort(t.used_km)}
                </span>
                <span className="ml-1.5 text-xl text-muted-foreground">/ {kmShort(t.fleet_limit_km)} km</span>
              </p>
              <p
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  tone === "bad" && "text-destructive",
                  tone === "warn" && "text-warning",
                )}
              >
                {percent.toLocaleString("en-IN", { maximumFractionDigits: 1 })}% used
              </p>
            </div>

            {/* Usage bar, with a tick where the fleet SHOULD be by today if it used the limit evenly */}
            <div className="relative">
              <div className="h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(percent)} percent of the fleet limit used`}>
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    tone === "bad" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-primary",
                  )}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              {paceMarker !== null ? (
                <span
                  className="absolute -top-1 h-5 w-0.5 rounded bg-foreground/60"
                  style={{ left: `${paceMarker}%` }}
                  title={`Even pace for today: ${kmShort((t.fleet_limit_km * t.days_elapsed) / t.days_total)} km`}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Bikes</p>
                <p className="font-semibold tabular-nums">{t.vehicle_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Limit per bike</p>
                <p className="font-semibold tabular-nums">{km(s.km_per_vehicle)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="font-semibold tabular-nums">{km(t.remaining_km)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t.period_status === "running" ? "On pace for" : "Final"}</p>
                <p className={cn("font-semibold tabular-nums", overBy > 0 && "text-destructive")}>
                  {km(t.projected_km)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({t.projected_percent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}%)
                  </span>
                </p>
              </div>
            </div>

            {overBy > 0 ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                At this pace the fleet will go {km(overBy)} over its limit by {formatDate(s.period_end)}.
              </p>
            ) : null}
            {t.awaiting_start > 0 ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                {t.awaiting_start} bike{t.awaiting_start === 1 ? " is" : "s are"} waiting for {t.awaiting_start === 1 ? "its" : "their"} starting
                odometer reading for this month, so {t.awaiting_start === 1 ? "it counts" : "they count"} as 0 km for now. This fills in within a couple
                of hours.
              </p>
            ) : null}
            {t.no_odometer > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t.no_odometer} bike{t.no_odometer === 1 ? " has" : "s have"} no tracker reading and {t.no_odometer === 1 ? "isn't" : "aren't"} counted.
              </p>
            ) : null}
          </>
        )}
      </div>

      {isAdmin ? <FleetAllowanceDialog open={editOpen} onOpenChange={setEditOpen} summary={data} /> : null}
    </Card>
  );
}
