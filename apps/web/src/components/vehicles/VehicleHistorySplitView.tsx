import { useMemo, useState } from "react";
import { Route, CircleDot, CalendarClock, Zap, Wrench, Recycle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { cn, formatDate } from "@/lib/utils";
import {
  buildVehicleTimeline, occurrencesByStatus, type VehicleEvent, type VehicleEventKind,
} from "@/lib/vehicleTimeline";
import { VehicleLifecycleDiagram } from "./VehicleLifecycleDiagram";
import { VehicleHistoryDetailPanel } from "./VehicleHistoryDetailPanel";
import type { VehicleDetail, VehicleStatus } from "@/types";

const KIND_ICON: Record<VehicleEventKind, typeof CircleDot> = {
  created: CircleDot,
  booking: CalendarClock,
  assignment: Zap,
  maintenance: Wrench,
  scrap: Recycle,
};

const FILTERABLE_KINDS: { kind: VehicleEventKind; label: string }[] = [
  { kind: "booking", label: "Bookings" },
  { kind: "assignment", label: "Assignments" },
  { kind: "maintenance", label: "Maintenance" },
];

/**
 * Split-screen history view: a filterable event timeline (left), the
 * vehicle's fixed lifecycle state diagram (center), and a detail panel for
 * whatever is selected (right) — replaces the old separate "Maintenance
 * history" / "Ride history" cards with one unified view.
 */
export function VehicleHistorySplitView({ vehicle }: { vehicle: VehicleDetail }) {
  const events = useMemo(() => buildVehicleTimeline(vehicle), [vehicle]);
  const occurrences = useMemo(() => occurrencesByStatus(vehicle), [vehicle]);

  const [activeKinds, setActiveKinds] = useState<Set<VehicleEventKind>>(
    () => new Set(FILTERABLE_KINDS.map((f) => f.kind)),
  );
  const [selectedStatus, setSelectedStatus] = useState<VehicleStatus | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const toggleKind = (kind: VehicleEventKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const selectEvent = (event: VehicleEvent) => {
    setSelectedEventId(event.id);
    setSelectedStatus(null);
  };

  const selectStatus = (status: VehicleStatus) => {
    setSelectedStatus((prev) => (prev === status ? null : status));
    setSelectedEventId(null);
  };

  const visibleEvents = events.filter((e) => e.kind === "created" || e.kind === "scrap" || activeKinds.has(e.kind));
  const listEvents = selectedStatus ? visibleEvents.filter((e) => e.status === selectedStatus) : visibleEvents;
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-4 w-4" /> Lifecycle &amp; history
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid divide-y divide-border lg:grid-cols-[260px_1fr_280px] lg:divide-x lg:divide-y-0">
          {/* Left: filters + event timeline */}
          <div className="max-h-[560px] overflow-y-auto p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Filter</p>
            <div className="mb-4 space-y-1.5">
              {FILTERABLE_KINDS.map((f) => (
                <label key={f.kind} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={activeKinds.has(f.kind)}
                    onChange={() => toggleKind(f.kind)}
                  />
                  {f.label}
                </label>
              ))}
            </div>

            {listEvents.length === 0 ? (
              <EmptyState title="No events" description="Nothing matches the current filters." />
            ) : (
              <div className="divide-y divide-border">
                {listEvents.map((event) => {
                  const Icon = KIND_ICON[event.kind];
                  const selected = selectedEvent?.id === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => selectEvent(event)}
                      className={cn(
                        "flex w-full items-start gap-2.5 py-2.5 text-left text-sm transition-smooth hover:bg-card-hover",
                        selected && "bg-accent",
                      )}
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{event.label}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(event.at)}</p>
                      </div>
                      <StatusBadge status={event.badgeStatus} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Center: lifecycle flow diagram */}
          <div className="flex items-center justify-center overflow-x-auto p-6">
            <VehicleLifecycleDiagram
              occurrences={occurrences}
              selectedStatus={selectedStatus}
              onSelectStatus={selectStatus}
            />
          </div>

          {/* Right: detail panel */}
          <div className="max-h-[560px] overflow-y-auto p-4">
            <VehicleHistoryDetailPanel
              vehicle={vehicle}
              events={events}
              selectedStatus={selectedStatus}
              selectedEvent={selectedEvent}
              occurrences={occurrences}
              onSelectEvent={selectEvent}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
