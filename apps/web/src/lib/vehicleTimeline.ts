import type { VehicleDetail, VehicleStatus } from "@/types";

export type VehicleEventKind = "created" | "booking" | "assignment" | "maintenance" | "scrap";

export interface VehicleEvent {
  id: string;
  kind: VehicleEventKind;
  /** Which lifecycle node this event belongs to, for diagram/list filtering. */
  status: VehicleStatus;
  label: string;
  subLabel: string | null;
  at: string;
  endAt: string | null;
  /** The specific status string to badge (e.g. a booking's own status, not just "booked"). */
  badgeStatus: string;
}

/** One unified, newest-first timeline built from the vehicle's existing history arrays — no new data source. */
export function buildVehicleTimeline(vehicle: VehicleDetail): VehicleEvent[] {
  const events: VehicleEvent[] = [
    {
      id: `created-${vehicle.id}`,
      kind: "created",
      status: "available",
      label: "Added to fleet",
      subLabel: null,
      at: vehicle.created_at,
      endAt: null,
      badgeStatus: "available",
    },
    ...vehicle.booking_history.map((b) => ({
      id: `booking-${b.id}`,
      kind: "booking" as const,
      status: "reserved" as VehicleStatus,
      label: b.rider ? `Booked by ${b.rider.full_name}` : "Booked",
      subLabel: `Start day ${b.start_day}`,
      at: b.created_at,
      endAt: null,
      badgeStatus: b.status,
    })),
    ...vehicle.rental_history.map((r) => ({
      id: `assignment-${r.id}`,
      kind: "assignment" as const,
      status: "assigned" as VehicleStatus,
      label: r.rider ? `Assigned to ${r.rider.full_name}` : "Assigned",
      subLabel: null,
      at: r.started_at,
      endAt: r.ended_at,
      badgeStatus: r.status,
    })),
    ...vehicle.maintenance_history.map((m) => ({
      id: `maintenance-${m.id}`,
      kind: "maintenance" as const,
      status: "maintenance" as VehicleStatus,
      label: m.description,
      subLabel: null,
      at: m.created_at,
      endAt: m.resolved_at,
      badgeStatus: m.status,
    })),
  ];

  if (vehicle.scrap_record) {
    events.push({
      // `vehicle_disposals` has no id of its own — it is keyed by the
      // vehicle, one disposal per scooter — so the vehicle id is the key.
      id: `scrap-${vehicle.id}`,
      kind: "scrap",
      status: "retired",
      label: "Scrapped",
      subLabel: vehicle.scrap_record.reason,
      at: vehicle.scrap_record.scrapped_on,
      endAt: null,
      badgeStatus: "retired",
    });
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/**
 * How many times this vehicle has occupied each status. "available" has no
 * row-per-occurrence source of its own, so it's derived: once at creation,
 * plus once every time a ride or a maintenance ticket resolved back to it.
 */
export function occurrencesByStatus(vehicle: VehicleDetail): Record<VehicleStatus, number> {
  const completedRentals = vehicle.rental_history.filter((r) => r.ended_at).length;
  const resolvedMaintenance = vehicle.maintenance_history.filter(
    (m) => m.resolved_at && m.outcome !== "not_repairable",
  ).length;

  return {
    available: 1 + completedRentals + resolvedMaintenance,
    reserved: vehicle.booking_history.length,
    assigned: vehicle.rental_history.length,
    maintenance: vehicle.maintenance_history.length,
    retired: vehicle.scrap_record ? 1 : 0,
  };
}

export interface DurationStats {
  totalMs: number;
  avgMs: number;
  /** Number of completed (start+end known) intervals the stats are based on. */
  count: number;
}

function computeDurationStats(intervals: Array<{ start: string; end: string | null }>): DurationStats {
  const durations = intervals
    .filter((i): i is { start: string; end: string } => !!i.end)
    .map((i) => new Date(i.end).getTime() - new Date(i.start).getTime());
  const totalMs = durations.reduce((sum, d) => sum + d, 0);
  return { totalMs, avgMs: durations.length ? totalMs / durations.length : 0, count: durations.length };
}

/** Duration stats are only honestly computable for statuses with a start+end on the same row. */
export function durationStatsForStatus(vehicle: VehicleDetail, status: VehicleStatus): DurationStats | null {
  if (status === "assigned") {
    return computeDurationStats(vehicle.rental_history.map((r) => ({ start: r.started_at, end: r.ended_at })));
  }
  if (status === "maintenance") {
    return computeDurationStats(vehicle.maintenance_history.map((m) => ({ start: m.created_at, end: m.resolved_at })));
  }
  return null;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.round(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && days === 0) parts.push(`${minutes}m`);
  return parts.length ? parts.join(" ") : "<1m";
}
