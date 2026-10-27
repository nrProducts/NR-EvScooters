import { Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicleActivity } from "@/hooks/useTelematics";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityDay, VehicleActivity } from "@/services/api/telematics";

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

const axisLabel = (day: string, today: string) =>
  day === today ? "Today" : day === plusDays(today, -1) ? "Yest." : weekday(day);

/** Ring size in px; the stroke width sits inside it. */
const RING = 170;
const RING_STROKE = 16;
/** Height of the tallest bar, in px. */
const BAR_MAX = 150;
/** Room above the tallest bar for its value label. */
const LABEL_ROOM = 26;

/** Today at a glance: the ring is the share of running time spent moving. */
function TodayRing({ today }: { today: ActivityDay | undefined }) {
  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const share = today?.has_data && today.ignition_hours > 0 ? Math.min(1, today.moving_hours / today.ignition_hours) : 0;

  return (
    <div>
      <div className="relative mx-auto" style={{ width: RING, height: RING }}>
        <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="-rotate-90" aria-hidden>
          <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" strokeWidth={RING_STROKE} style={{ stroke: "hsl(var(--primary) / 0.15)" }} />
          <circle
            cx={RING / 2} cy={RING / 2} r={r} fill="none" strokeWidth={RING_STROKE} strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`} style={{ stroke: "hsl(var(--primary))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-2xl font-bold leading-none tabular-nums">{today?.has_data ? hours(today.ignition_hours) : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">running today</p>
        </div>
      </div>
      <p className="mt-3 text-center text-sm">
        {today?.has_data ? (
          <>
            <span className="font-semibold tabular-nums">{hours(today.moving_hours)}</span>{" "}
            <span className="text-muted-foreground">moving · {Math.round(share * 100)}% of the time</span>
          </>
        ) : (
          <span className="text-muted-foreground">No activity yet today</span>
        )}
      </p>
    </div>
  );
}

function StatRow({ label, running, moving, className }: { label: string; running: string; moving: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3", className)}>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold tabular-nums">{running}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">moving</p>
        <p className="text-base font-semibold tabular-nums">{moving}</p>
      </div>
    </div>
  );
}

/** Seven bars with their hours written above them, a dashed line at the 7-day average. */
function WeekChart({ days, today, avg }: { days: ActivityDay[]; today: string; avg: number }) {
  const ordered = [...days].reverse(); // oldest on the left, today on the right
  const max = Math.max(...days.map((d) => d.ignition_hours), 0);
  const px = (h: number) => (max > 0 ? Math.max(h > 0 ? 3 : 0, (h / max) * BAR_MAX) : 0);

  return (
    <div>
      <div className="relative" style={{ height: BAR_MAX + LABEL_ROOM }}>
        <div className="absolute inset-0 flex items-end gap-2 sm:gap-3">
          {ordered.map((d) => (
            <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <p className="mb-1.5 whitespace-nowrap text-xs font-semibold tabular-nums">{d.has_data ? hours(d.ignition_hours) : "—"}</p>
              <div
                className={cn("relative w-full max-w-[2.875rem] overflow-hidden rounded-t-lg bg-primary/25", d.day === today && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card")}
                style={{ height: px(d.ignition_hours) }}
                title={`${axisLabel(d.day, today)}: ${hours(d.ignition_hours)} running, ${hours(d.moving_hours)} moving`}
              >
                <div
                  className="absolute inset-x-0 bottom-0 bg-primary"
                  style={{ height: d.ignition_hours > 0 ? `${Math.min(100, (d.moving_hours / d.ignition_hours) * 100)}%` : 0 }}
                />
              </div>
            </div>
          ))}
        </div>

        {avg > 0 && max > 0 && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/60" style={{ bottom: (avg / max) * BAR_MAX }}>
            <span className="absolute -top-5 left-0 rounded bg-card px-1.5 text-[0.6875rem] font-medium tabular-nums text-muted-foreground">
              avg {hours(avg)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex gap-2 sm:gap-3">
        {ordered.map((d) => (
          <p key={d.day} className={cn("min-w-0 flex-1 text-center text-xs text-muted-foreground", d.day === today && "font-bold text-primary")}>
            {axisLabel(d.day, today)}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Running hours for the last 7 days. Left: today as a ring (share of running time spent moving),
 * yesterday and the 7-day average beneath it. Right: a bar for each day with its hours written
 * above, and a dashed line at the average. "Running" is time with the key on; "moving" is time
 * actually moving. From the tracker's GPS history; admin console only.
 */
export function VehicleActivityCard({ vehicleId }: { vehicleId: string }) {
  const { data, isLoading, isError } = useVehicleActivity(vehicleId);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Timer className="h-4 w-4 text-muted-foreground" /> Running hours · last 7 days
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Running = key on. Moving = actually riding.</p>
        </div>
        {data?.available && data.computed_at ? (
          <p className="text-xs text-muted-foreground">Updated {timeAgo(data.computed_at)}</p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-48 w-full" />
        </div>
      ) : isError ? (
        <p className="p-5 text-sm text-destructive">Couldn&apos;t load the running hours.</p>
      ) : !data?.available ? (
        <p className="m-5 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {data?.message ?? "Running hours are not available."}
        </p>
      ) : (
        <WeekView data={data} />
      )}
    </Card>
  );
}

function WeekView({ data }: { data: Extract<VehicleActivity, { available: true }> }) {
  const todayRow = data.days.find((d) => d.day === data.today);
  const yesterdayRow = data.days.find((d) => d.day === plusDays(data.today, -1));
  // Averaged over the whole window: a day the bike did not run counts as zero.
  const dayCount = Math.max(1, data.days.length);
  const avgRun = data.totals.ignition_hours / dayCount;
  const avgMov = data.totals.moving_hours / dayCount;

  return (
    <>
      <div className="grid gap-8 p-5 lg:grid-cols-[18.75rem_1fr]">
        <div className="space-y-4">
          <TodayRing today={todayRow} />
          <div className="space-y-2">
            <StatRow
              label="Yesterday"
              running={yesterdayRow?.has_data ? hours(yesterdayRow.ignition_hours) : "—"}
              moving={yesterdayRow?.has_data ? hours(yesterdayRow.moving_hours) : "—"}
            />
            <StatRow label="7-day average / day" running={hours(avgRun)} moving={hours(avgMov)} className="bg-primary/10" />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground">Last 7 days</span>
            <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Moving</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary/25" /> Key on, parked</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted-foreground/70" /> Average</span>
            </span>
          </div>
          <WeekChart days={data.days} today={data.today} avg={avgRun} />
        </div>
      </div>

      <div className="border-t border-border px-5 py-3">
        {data.note ? (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{data.note}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Finished days are final. Today refreshes about every 3 hours while this page is open. The average counts today so far.
          </p>
        )}
      </div>
    </>
  );
}
