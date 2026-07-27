import { useMemo } from "react";
import type { Vehicle, VehicleStatus } from "@/types";

const STATUS_COLOR: Record<VehicleStatus, string> = {
  available: "#16a34a",
  booked: "#2563eb",
  assigned: "#2563eb",
  charging: "#f59e0b",
  maintenance: "#dc2626",
  scrap: "#6b7280",
  offline: "#6b7280",
};

/**
 * Lightweight placeholder map widget rendered as SVG — plots vehicles by
 * normalized lat/lng within a bounding box. Swap for Google Maps / MapLibre
 * by replacing this component; the prop contract (vehicles + onSelect) can
 * stay the same.
 */
export function MapWidget({
  vehicles,
  onSelect,
  height = 420,
}: {
  vehicles: Vehicle[];
  onSelect?: (vehicle: Vehicle) => void;
  height?: number;
}) {
  const bounds = useMemo(() => {
    const lats = vehicles.map((v) => v.lat);
    const lngs = vehicles.map((v) => v.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [vehicles]);

  const project = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 100;
    const y = 100 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) * 100;
    return { x, y };
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-border bg-[linear-gradient(#e5e9f0_1px,transparent_1px),linear-gradient(90deg,#e5e9f0_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(#1f2937_1px,transparent_1px),linear-gradient(90deg,#1f2937_1px,transparent_1px)]"
      style={{ height }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {vehicles.map((v) => {
          const { x, y } = project(v.lat, v.lng);
          return (
            <circle
              key={v.id}
              cx={x}
              cy={y}
              r={1.6}
              fill={STATUS_COLOR[v.status]}
              stroke="white"
              strokeWidth={0.4}
              className="cursor-pointer"
              onClick={() => onSelect?.(v)}
            >
              <title>{`${v.registrationNumber} — ${v.status}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-card/90 px-3 py-2 text-xs shadow-soft backdrop-blur">
        {(Object.entries(STATUS_COLOR) as [VehicleStatus, string][])
          .filter(([status]) => ["available", "booked", "charging", "maintenance", "offline"].includes(status))
          .map(([status, color]) => (
            <span key={status} className="flex items-center gap-1 capitalize">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {status}
            </span>
          ))}
      </div>
    </div>
  );
}
