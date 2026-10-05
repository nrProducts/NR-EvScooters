import { Info } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/utils";
import { durationStatsForStatus, formatDuration, type VehicleEvent } from "@/lib/vehicleTimeline";
import type { VehicleDetail, VehicleStatus } from "@/types";

const STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  assigned: "Assigned",
  maintenance: "Maintenance",
  retired: "Retired",
};

export function VehicleHistoryDetailPanel({
  vehicle,
  events,
  selectedStatus,
  selectedEvent,
  occurrences,
  onSelectEvent,
}: {
  vehicle: VehicleDetail;
  events: VehicleEvent[];
  selectedStatus: VehicleStatus | null;
  selectedEvent: VehicleEvent | null;
  occurrences: Record<VehicleStatus, number>;
  onSelectEvent: (event: VehicleEvent) => void;
}) {
  if (selectedEvent) {
    return <EventDetail event={selectedEvent} />;
  }

  if (selectedStatus) {
    const stats = durationStatsForStatus(vehicle, selectedStatus);
    const related = events.filter((e) => e.status === selectedStatus);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{STATUS_LABEL[selectedStatus]}</h3>
          <StatusBadge status={selectedStatus} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Occurrences" value={String(occurrences[selectedStatus])} />
          {stats && (
            <>
              <Stat label="Completed" value={String(stats.count)} />
              <Stat label="Total time" value={stats.count ? formatDuration(stats.totalMs) : "—"} />
              <Stat label="Avg time" value={stats.count ? formatDuration(stats.avgMs) : "—"} />
            </>
          )}
        </div>

        {!stats && (
          <p className="flex items-start gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Duration isn't tracked per-occurrence for this status — see the events below for exact dates.
          </p>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Events in this state</p>
          {related.length === 0 ? (
            <p className="text-xs text-muted-foreground">None yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {related.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelectEvent(e)}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-xs transition-smooth hover:bg-card-hover"
                >
                  <span className="font-medium">{e.label}</span>
                  <span className="text-muted-foreground">{formatDate(e.at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Nothing selected — overall summary.
  const lastEvent = events[0] ?? null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Overview</h3>
        <StatusBadge status={vehicle.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Total events" value={String(events.length)} />
        <Stat label="Last activity" value={lastEvent ? formatDate(lastEvent.at) : "—"} />
      </div>
      <p className="text-xs text-muted-foreground">
        Click a state in the diagram to see aggregate stats, or an event in the list to see its full detail.
      </p>
    </div>
  );
}

function EventDetail({ event }: { event: VehicleEvent }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{event.label}</h3>
        <StatusBadge status={event.badgeStatus} />
      </div>
      {event.subLabel && <p className="text-sm text-muted-foreground">{event.subLabel}</p>}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Started" value={formatDate(event.at)} />
        <Stat label="Ended" value={event.endAt ? formatDate(event.endAt) : "Ongoing / not recorded"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
