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
export function FleetAllowanceCard({
  variant = "dashboard", className,
}: {
  /** "gauge" is the dashboard's half-circle card; "compact" the slim tile; "dashboard" and "page" the full card. */
  variant?: "dashboard" | "page" | "compact" | "gauge";
  className?: string;
}) {
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

  // One line on how the month is going, shared by the compact tile and the gauge.
  const note = !t ? null
    : t.awaiting_start > 0 ? `${t.awaiting_start} bike${t.awaiting_start === 1 ? "" : "s"} awaiting a starting reading — counts as 0 km for now`
      : overBy > 0 ? `On pace to exceed the limit by ${km(overBy)}`
        : t.period_status === "running" ? `On pace for ${km(t.projected_km)} (${t.projected_percent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}%)`
          : null;

  // The dashboard's half-circle gauge: the share of the fleet limit used, with the
  // figures beneath. Same data and the same tone rules as the bar versions.
  if (variant === "gauge") {
    const arc = tone === "bad" ? "hsl(var(--destructive))" : tone === "warn" ? "hsl(var(--warning))" : "url(#kmGaugeGreen)";
    const remaining = t ? Math.max(0, t.fleet_limit_km - t.used_km) : 0;
    const facts: { label: string; value: string }[] = t
      ? [
        { label: "Used", value: `${kmShort(t.used_km)} km` },
        { label: "Limit", value: `${kmShort(t.fleet_limit_km)} km` },
        { label: "Remaining", value: `${kmShort(remaining)} km` },
        { label: "Bikes", value: String(t.vehicle_count) },
      ]
      : [];
    return (
      <Card className={cn("flex flex-col p-4", className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Fleet km allowance</h3>
            {s ? <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{periodLabel} · {periodNote}</p> : null}
          </div>
          <div className="flex shrink-0 items-center">
            {isAdmin && data ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit limit & month" aria-label="Edit limit and month" onClick={() => setEditOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to="/vehicles?view=kms">Details <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="mt-3 w-full flex-1" />
        ) : isError || !t || !s ? (
          <p className="mt-3 text-xs text-muted-foreground">Not set up yet — needs the allowance database update.</p>
        ) : (
          <>
            {/* The gauge on the left, four plain facts on the right: it fills the card instead of floating in it. */}
            <div className="flex flex-1 items-center gap-4 py-1.5">
              <svg viewBox="0 0 200 112" className="w-32 shrink-0" role="img" aria-label={`${Math.round(percent)} percent of the fleet limit used`}>
                <defs>
                  <linearGradient id="kmGaugeGreen" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#3CCB73" />
                    <stop offset="100%" stopColor="#17924A" />
                  </linearGradient>
                </defs>
                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--primary) / 0.14)" strokeWidth="18" strokeLinecap="round" />
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={arc} strokeWidth="18" strokeLinecap="round"
                  pathLength={100} strokeDasharray={`${Math.min(100, percent)} 100`}
                />
                <text x="100" y="94" textAnchor="middle" fontSize="30" fontWeight="700" className="fill-foreground tabular-nums">
                  {percent.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
                </text>
              </svg>
              <dl className="min-w-0 flex-1 space-y-1.5">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1 last:border-0 last:pb-0">
                    <dt className="text-[0.6875rem] text-muted-foreground">{fact.label}</dt>
                    <dd className="text-[0.8125rem] font-semibold tabular-nums">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {note ? (
              <p
                className={cn("truncate text-[0.6875rem]", overBy > 0 ? "text-destructive" : t.awaiting_start > 0 ? "text-warning" : "text-muted-foreground")}
                title={note}
              >
                {note}
              </p>
            ) : null}
          </>
        )}

        {isAdmin ? <FleetAllowanceDialog open={editOpen} onOpenChange={setEditOpen} summary={data} /> : null}
      </Card>
    );
  }

  // The slim tile for the dashboard: one headline figure, one bar, one line of detail.
  // The full breakdown (warnings, pace, per-bike) is a click away in Vehicles → Bike KMs.
  if (variant === "compact") {
    return (
      <Card className={cn("flex flex-col overflow-hidden", className)}>
        <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Gauge className="h-4 w-4 text-muted-foreground" /> Fleet km allowance
            </h3>
            {s ? <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{periodLabel} · {periodNote}</p> : null}
          </div>
          <div className="flex shrink-0 items-center">
            {isAdmin && data ? (
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit limit & month" aria-label="Edit limit and month" onClick={() => setEditOpen(true)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to="/vehicles?view=kms">Details <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </div>
        </div>

        <div className="space-y-2 px-4 pb-3.5 pt-2.5">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : isError || !t || !s ? (
            <p className="text-xs text-muted-foreground">Not set up yet — needs the allowance database update.</p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="tabular-nums">
                  <span className={cn("text-2xl font-semibold leading-none", tone === "bad" && "text-destructive", tone === "warn" && "text-warning")}>
                    {kmShort(t.used_km)}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">/ {kmShort(t.fleet_limit_km)} km</span>
                </p>
                <p className={cn("text-sm font-semibold tabular-nums", tone === "bad" && "text-destructive", tone === "warn" && "text-warning")}>
                  {percent.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
                </p>
              </div>
              <div className="relative">
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(percent)} percent of the fleet limit used`}>
                  <div
                    className={cn("h-full rounded-full transition-all", tone === "bad" ? "bg-destructive" : tone === "warn" ? "bg-warning" : "bg-primary")}
                    style={{ width: `${Math.min(100, percent)}%` }}
                  />
                </div>
                {paceMarker !== null ? (
                  <span
                    className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60"
                    style={{ left: `${paceMarker}%` }}
                    title={`Even pace for today: ${kmShort((t.fleet_limit_km * t.days_elapsed) / t.days_total)} km`}
                  />
                ) : null}
              </div>
              <p className={cn("truncate text-[0.6875rem]", overBy > 0 ? "text-destructive" : t.awaiting_start > 0 ? "text-warning" : "text-muted-foreground")}>
                {t.vehicle_count} bikes × {km(s.km_per_vehicle)}{note ? ` · ${note}` : ""}
              </p>
            </>
          )}
        </div>

        {isAdmin ? <FleetAllowanceDialog open={editOpen} onOpenChange={setEditOpen} summary={data} /> : null}
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4 text-muted-foreground" /> Fleet kilometre allowance
          </h3>
          {s ? <p className="mt-0.5 text-xs text-muted-foreground">{periodLabel} · {periodNote}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && data ? (
            <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
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
          <p className="text-sm text-muted-foreground">
            The kilometre allowance isn&apos;t set up yet. It needs a database update (the
            &ldquo;fleet kilometre allowance&rdquo; migration) before it can be shown or edited.
            {isAdmin ? " The Edit button appears here once that is applied." : ""}
          </p>
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
