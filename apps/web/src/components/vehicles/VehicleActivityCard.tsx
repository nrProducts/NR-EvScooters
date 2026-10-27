import { Gauge, Timer, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicleActivity } from "@/hooks/useTelematics";
import { cn, timeAgo } from "@/lib/utils";
import type { ActivityDay } from "@/services/api/telematics";

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

function dayLabel(day: string, today: string): { title: string; sub: string } {
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC",
  });
  if (day === today) return { title: "Today", sub: `${date} · so far` };
  if (day === plusDays(today, -1)) return { title: "Yesterday", sub: date };
  return { title: date.split(",")[0], sub: date.split(",").slice(1).join(",").trim() || date };
}

function Total({ icon: Icon, label, value }: { icon: typeof Timer; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-2 text-2xl font-semibold leading-none tabular-nums">{value}</p>
    </div>
  );
}

function DayRow({ d, today, scaleMax }: { d: ActivityDay; today: string; scaleMax: number }) {
  const { title, sub } = dayLabel(d.day, today);
  const width = scaleMax > 0 ? Math.min(100, (d.ignition_hours / scaleMax) * 100) : 0;
  const movingWidth = scaleMax > 0 ? Math.min(100, (d.moving_hours / scaleMax) * 100) : 0;
  return (
    <div className="grid items-center gap-x-6 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 md:grid-cols-[9rem_1fr_15rem]">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>

      {/* Bar: running (key on) with the moving part darker inside it */}
      <div className="min-w-0">
        {d.has_data ? (
          <div className="relative h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${hours(d.ignition_hours)} running, ${hours(d.moving_hours)} moving`}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary/35" style={{ width: `${width}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${movingWidth}%` }} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No activity — the bike didn&apos;t move this day.</p>
        )}
      </div>

      <div className={cn("grid grid-cols-3 gap-2 text-right tabular-nums", !d.has_data && "opacity-50")}>
        <div>
          <p className="text-sm font-semibold">{hours(d.ignition_hours)}</p>
          <p className="text-[0.6875rem] text-muted-foreground">running</p>
        </div>
        <div>
          <p className="text-sm font-semibold">{hours(d.moving_hours)}</p>
          <p className="text-[0.6875rem] text-muted-foreground">moving</p>
        </div>
        <div>
          <p className="text-sm font-semibold">{d.trips}</p>
          <p className="text-[0.6875rem] text-muted-foreground">trips</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Running hours for the last 7 days, one row per day — today, yesterday and
 * the five days before. "Running" is time with the key on; "moving" is time
 * actually moving. From the tracker's GPS history; admin console only.
 */
export function VehicleActivityCard({ vehicleId }: { vehicleId: string }) {
  const { data, isLoading, isError } = useVehicleActivity(vehicleId);

  const maxHours = data?.available ? Math.max(...data.days.map((d) => d.ignition_hours), 0) : 0;
  // A little headroom so the longest day does not touch the edge, and a floor so a
  // quiet week is not drawn as a wall of full bars.
  const scaleMax = Math.max(maxHours * 1.05, 4);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Timer className="h-4 w-4 text-muted-foreground" /> Running hours · last 7 days
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Running = key on. Moving = actually moving. Today and the six days before it.
          </p>
        </div>
        {data?.available && data.computed_at ? (
          <p className="text-xs text-muted-foreground">Updated {timeAgo(data.computed_at)}</p>
        ) : null}
      </div>

      <div className="space-y-4 p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load the running hours.</p>
        ) : !data?.available ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {data?.message ?? "Running hours are not available."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Total icon={Timer} label="Running (7 days)" value={hours(data.totals.ignition_hours)} />
              <Total icon={Gauge} label="Moving (7 days)" value={hours(data.totals.moving_hours)} />
              <Total icon={Zap} label="Trips (7 days)" value={String(data.totals.trips)} />
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              {data.days.map((d) => (
                <DayRow key={d.day} d={d} today={data.today} scaleMax={scaleMax} />
              ))}
            </div>

            {data.note ? (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">{data.note}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Finished days are final. Today refreshes about every 3 hours while this page is open.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
