import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicleActivity, useVehicleKms } from "@/hooks/useTelematics";
import { cn, timeAgo } from "@/lib/utils";

/** Height of the plotted area in px; the 36 px above it holds the tallest bar's label. */
const PLOT = 240;
const TOP = 36;

const km1 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

/** 5.07 → "5 h 4 m"; 0 → "0 m". */
function hours(h: number): string {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm} m`;
  return mm === 0 ? `${hh} h` : `${hh} h ${mm} m`;
}

const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const weekday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** A distance scale with four equal steps and round labels (…, 50, 100, 150, 200). */
function niceKmMax(max: number): number {
  if (max <= 0) return 20;
  const rough = max / 4;
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => s >= rough) ?? Math.ceil(rough / 100) * 100;
  return step * 4;
}

/** A running-time scale with four whole-hour steps (12, 16, 20 or 24 h). */
const niceHourMax = (h: number) => [12, 16, 20, 24].find((m) => m >= h) ?? 24;

interface DayPoint {
  day: string;
  /** Null when there is no distance reading for the day. */
  km: number | null;
  /** Null when the bike reported nothing that day. */
  hours: number | null;
}

function Stat({ label, km, time, tone, className }: { label: string; km: string; time: string; tone?: "today"; className?: string }) {
  return (
    <div className={cn("px-5 py-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <span className={cn("text-3xl font-bold leading-none tracking-tight tabular-nums", tone === "today" && "text-primary")}>
          {km}
          {km !== "—" ? <span className="ml-1 text-sm font-medium text-muted-foreground">km</span> : null}
        </span>
        <span className="text-xl font-bold leading-none tracking-tight tabular-nums text-info">{time}</span>
      </p>
    </div>
  );
}

/**
 * Distance and running time for the last 7 days, in one card: bars are the kilometres ridden
 * (left axis), the line is the time the key was on (right axis). Above the chart: today,
 * yesterday, the 7-day average and the 7- / 30-day distance. Distance comes from the 2-hourly
 * distance sync, running time from the tracker's GPS history; admin console only.
 */
export function VehicleWeekCard({ vehicleId }: { vehicleId: string }) {
  const kms = useVehicleKms(vehicleId);
  const act = useVehicleActivity(vehicleId);

  const kmData = kms.data && kms.data.days.some((d) => d.has_data) ? kms.data : null;
  const actData = act.data?.available ? act.data : null;
  const loading = (kms.isLoading || act.isLoading) && !kmData && !actData;

  // Newest first, same 7 days for both feeds; a feed without a figure for a day leaves it null.
  const baseDays = kms.data?.days.map((d) => d.day) ?? actData?.days.map((d) => d.day) ?? [];
  const today = kms.data?.today ?? actData?.today ?? "";
  const points: DayPoint[] = baseDays.map((day) => {
    const k = kms.data?.days.find((d) => d.day === day);
    const a = actData?.days.find((d) => d.day === day);
    return {
      day,
      km: k?.has_data ? k.km : null,
      hours: a?.has_data ? a.ignition_hours : null,
    };
  });
  const ordered = [...points].reverse(); // oldest on the left, today on the right

  const hasKm = !!kmData;
  const hasHours = !!actData && points.some((p) => p.hours !== null);

  const kmMax = niceKmMax(Math.max(...points.map((p) => p.km ?? 0), 0));
  const hMax = niceHourMax(Math.max(...points.map((p) => p.hours ?? 0), 0));
  const n = Math.max(1, ordered.length);

  const todayPt = points.find((p) => p.day === today);
  const yesterdayPt = points.find((p) => p.day === plusDays(today, -1));
  const avgKm = kmData ? kmData.km_7d / 7 : null;
  const avgHours = actData ? actData.totals.ignition_hours / Math.max(1, actData.days.length) : null;

  const linePts = ordered
    .map((p, i) => (p.hours === null ? null : `${(((i + 0.5) / n) * 1000).toFixed(1)},${(TOP + (1 - p.hours / hMax) * PLOT).toFixed(1)}`))
    .filter((s): s is string => s !== null)
    .join(" ");

  const updatedAt = [kms.data?.updated_at, actData?.computed_at].filter((x): x is string => !!x).sort().pop();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Activity className="h-4 w-4 text-muted-foreground" /> Activity · last 7 days
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Distance ridden and time the key was on, from the tracker. Running = key on.
          </p>
        </div>
        {updatedAt ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Updated {timeAgo(updatedAt)}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-4 p-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !hasKm && !hasHours ? (
        <div className="space-y-2 p-5">
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {kms.isError && act.isError
              ? "Couldn't load the activity."
              : "No distance or running time recorded yet. It appears here within a couple of hours of tracking being switched on for this scooter."}
          </p>
          {act.data && !act.data.available ? <p className="text-xs text-muted-foreground">{act.data.message}</p> : null}
        </div>
      ) : (
        <>
          {/* Summary strip: distance in the page's green, running time in blue */}
          <div className="m-5 mb-0 grid grid-cols-2 overflow-hidden rounded-2xl bg-muted/60 lg:grid-cols-4 [&>*]:border-border max-lg:[&>*:nth-child(n+3)]:border-t lg:[&>*+*]:border-l max-lg:[&>*:nth-child(even)]:border-l">
            <Stat
              label="Today"
              tone="today"
              km={todayPt?.km != null ? km1(todayPt.km) : "—"}
              time={todayPt?.hours != null ? hours(todayPt.hours) : "—"}
            />
            <Stat
              label="Yesterday"
              km={yesterdayPt?.km != null ? km1(yesterdayPt.km) : "—"}
              time={yesterdayPt?.hours != null ? hours(yesterdayPt.hours) : "—"}
            />
            <Stat
              label="7-day average a day"
              km={avgKm !== null ? km1(avgKm) : "—"}
              time={avgHours !== null ? hours(avgHours) : "—"}
            />
            <div className="px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last 7 / 30 days</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                <span className="text-3xl font-bold leading-none tracking-tight tabular-nums">
                  {kmData ? km1(kmData.km_7d) : "—"}
                  {kmData ? <span className="ml-1 text-sm font-medium text-muted-foreground">km</span> : null}
                </span>
                <span className="text-base font-semibold leading-none tabular-nums text-muted-foreground">
                  {kmData ? `${km1(kmData.km_30d)} km` : ""}
                </span>
              </p>
            </div>
          </div>

          {/* Combined chart: bars = distance, line = running time */}
          <div className="p-5 pt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">Distance and running time, each day</span>
              <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {hasKm ? (
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Distance (km, left)</span>
                ) : null}
                {hasHours ? (
                  <span className="inline-flex items-center gap-1.5"><span className="w-4 rounded border-t-[3px] border-info" /> Running time (hours, right)</span>
                ) : null}
              </span>
            </div>

            <div className="relative ml-10 mr-12" style={{ height: TOP + PLOT }} role="img"
              aria-label="Distance and running time for each of the last 7 days">
              {/* gridlines and both axes */}
              <div className="absolute inset-x-0 bottom-0" style={{ top: TOP }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="absolute inset-x-0 h-0 border-t border-border" style={{ bottom: (i / 4) * PLOT }}>
                    {hasKm ? (
                      <span className="absolute -left-10 top-[-8px] w-8 text-right text-[0.6875rem] tabular-nums text-muted-foreground">
                        {(kmMax / 4) * i}
                      </span>
                    ) : null}
                    {hasHours ? (
                      <span className="absolute -right-12 top-[-8px] w-10 text-left text-[0.6875rem] tabular-nums text-info">
                        {(hMax / 4) * i} h
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              {hasKm ? <span className="absolute -left-10 top-2 w-8 text-right text-[0.6875rem] font-semibold text-muted-foreground">km</span> : null}
              {hasHours ? <span className="absolute -right-12 top-2 w-10 text-[0.6875rem] font-semibold text-info">hours</span> : null}

              {/* bars */}
              <div className="absolute inset-0 flex items-stretch">
                {ordered.map((p) => {
                  const isToday = p.day === today;
                  const h = p.km !== null ? Math.round((p.km / kmMax) * PLOT) : 0;
                  const inside = h >= 26;
                  return (
                    <div
                      key={p.day}
                      className={cn("mx-1 flex min-w-0 flex-1 flex-col items-center justify-end rounded-xl sm:mx-1.5", isToday && "bg-muted/50")}
                    >
                      {p.km === null ? (
                        <span className="mb-2 text-xs text-muted-foreground" title="No distance reading">—</span>
                      ) : (
                        <>
                          {!inside ? <span className="mb-1 text-xs font-bold tabular-nums">{km1(p.km)}</span> : null}
                          <div
                            className={cn(
                              "relative w-full max-w-16 rounded-t-[10px] rounded-b-[3px]",
                              isToday ? "bg-primary" : "bg-primary/40",
                            )}
                            style={{ height: h }}
                            title={`${shortDate(p.day)}: ${km1(p.km)} km`}
                          >
                            {inside ? (
                              <span
                                className={cn(
                                  "absolute inset-x-0 bottom-2 text-center text-xs font-bold tabular-nums",
                                  isToday ? "text-primary-foreground" : "text-foreground",
                                )}
                              >
                                {km1(p.km)}
                              </span>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* running-time line: x in % of the width so it always lines up with the bars */}
              {hasHours && linePts ? (
                <svg viewBox={`0 0 1000 ${TOP + PLOT}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                  <polyline
                    points={linePts}
                    fill="none"
                    stroke="hsl(var(--info))"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}

              {/* running-time dots and their labels */}
              {hasHours ? (
                <div className="pointer-events-none absolute inset-0">
                  {ordered.map((p, i) =>
                    p.hours === null ? null : (
                      <div
                        key={p.day}
                        className="absolute h-0 w-0"
                        style={{ left: `${(((i + 0.5) / n) * 100).toFixed(3)}%`, bottom: Math.round((p.hours / hMax) * PLOT) }}
                      >
                        <span className="absolute -bottom-[7px] -left-[7px] h-3.5 w-3.5 rounded-full border-[3px] border-card bg-info" />
                        <span className="absolute -left-10 bottom-3 hidden w-20 text-center sm:block">
                          <span className="rounded-md bg-card px-1.5 py-px text-xs font-bold tabular-nums text-info">{hours(p.hours)}</span>
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : null}
            </div>

            {/* day labels */}
            <div className="ml-10 mr-12 mt-2.5 flex">
              {ordered.map((p) => {
                const isToday = p.day === today;
                return (
                  <div key={p.day} className="mx-1 min-w-0 flex-1 text-center sm:mx-1.5">
                    <p className={cn("text-[0.8125rem]", isToday ? "font-bold text-primary" : "font-medium")}>
                      {isToday ? "Today" : p.day === plusDays(today, -1) ? "Yest." : weekday(p.day)}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{shortDate(p.day)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-border px-5 py-3">
            {actData?.note ? <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{actData.note}</p> : null}
            {!hasHours && act.data && !act.data.available ? (
              <p className="text-xs text-muted-foreground">Running time isn&apos;t available: {act.data.message}</p>
            ) : null}
            {!hasKm ? (
              <p className="text-xs text-muted-foreground">No distance recorded yet; it appears within a couple of hours of tracking starting.</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Distance refreshes about every 2 hours, so today is the figure as of the last refresh; running time about every 3 hours while this
              page is open. A day shown as — has no reading.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
