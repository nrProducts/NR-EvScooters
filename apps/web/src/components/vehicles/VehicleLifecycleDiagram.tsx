import { CircleDot, BatteryCharging, CalendarClock, Zap, Wrench, Recycle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VehicleStatus } from "@/types";

type NodeKey = "created" | VehicleStatus;

interface NodePos {
  x: number;
  y: number;
}

const NODE_W = 128;
const NODE_H = 44;
const VIEWBOX_W = 400;
const VIEWBOX_H = 480;

const POSITIONS: Record<NodeKey, NodePos> = {
  created: { x: 100, y: 30 },
  available: { x: 100, y: 130 },
  booked: { x: 100, y: 230 },
  assigned: { x: 100, y: 330 },
  maintenance: { x: 300, y: 230 },
  scrap: { x: 300, y: 430 },
};

const NODE_META: Record<NodeKey, { label: string; icon: typeof CircleDot; tone: "default" | "success" | "info" | "destructive" | "muted" }> = {
  created: { label: "Created", icon: CircleDot, tone: "default" },
  available: { label: "Available", icon: BatteryCharging, tone: "success" },
  booked: { label: "Booked", icon: CalendarClock, tone: "info" },
  assigned: { label: "Assigned", icon: Zap, tone: "info" },
  maintenance: { label: "Maintenance", icon: Wrench, tone: "destructive" },
  scrap: { label: "Scrap", icon: Recycle, tone: "muted" },
};

const TONE_CLASSES: Record<string, string> = {
  default: "border-border bg-card text-foreground",
  success: "border-success/40 bg-success/10 text-success",
  info: "border-info/40 bg-info/10 text-info",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
};

/** Hand-tuned connector paths — the state machine is small and fixed, so exact per-edge curves read cleaner than a generic layout algorithm. Nodes render on top and cover the in-node segments. */
const EDGES: { path: string; dashed?: boolean }[] = [
  { path: `M ${POSITIONS.created.x} ${POSITIONS.created.y} L ${POSITIONS.available.x} ${POSITIONS.available.y}` },
  { path: `M ${POSITIONS.available.x} ${POSITIONS.available.y} L ${POSITIONS.booked.x} ${POSITIONS.booked.y}` },
  { path: `M ${POSITIONS.booked.x} ${POSITIONS.booked.y} L ${POSITIONS.assigned.x} ${POSITIONS.assigned.y}` },
  // assigned -> available (ride ends): loop bowed left
  { path: "M 100 330 C 15 330, 15 130, 100 130", dashed: true },
  { path: `M ${POSITIONS.available.x} ${POSITIONS.available.y} L ${POSITIONS.maintenance.x} ${POSITIONS.maintenance.y}` },
  { path: `M ${POSITIONS.booked.x} ${POSITIONS.booked.y} L ${POSITIONS.maintenance.x} ${POSITIONS.maintenance.y}` },
  { path: `M ${POSITIONS.assigned.x} ${POSITIONS.assigned.y} L ${POSITIONS.maintenance.x} ${POSITIONS.maintenance.y}` },
  // maintenance -> available (fixed / handed back): loop bowed over the top
  { path: "M 300 230 C 300 55, 100 55, 100 130", dashed: true },
  { path: `M ${POSITIONS.maintenance.x} ${POSITIONS.maintenance.y} L ${POSITIONS.scrap.x} ${POSITIONS.scrap.y}` },
];

export function VehicleLifecycleDiagram({
  occurrences,
  selectedStatus,
  onSelectStatus,
}: {
  occurrences: Record<VehicleStatus, number>;
  selectedStatus: VehicleStatus | null;
  onSelectStatus: (status: VehicleStatus) => void;
}) {
  return (
    <div className="relative mx-auto" style={{ width: VIEWBOX_W, maxWidth: "100%" }}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className="w-full"
        style={{ aspectRatio: `${VIEWBOX_W} / ${VIEWBOX_H}` }}
      >
        <defs>
          <marker id="vehicle-lifecycle-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-border" />
          </marker>
        </defs>
        {EDGES.map((edge, i) => (
          <path
            key={i}
            d={edge.path}
            fill="none"
            className="stroke-border"
            strokeWidth={1.5}
            strokeDasharray={edge.dashed ? "4 3" : undefined}
            markerEnd="url(#vehicle-lifecycle-arrow)"
          />
        ))}
      </svg>

      {(Object.keys(POSITIONS) as NodeKey[]).map((key) => {
        const pos = POSITIONS[key];
        const meta = NODE_META[key];
        const Icon = meta.icon;
        const isStatus = key !== "created";
        const selected = isStatus && selectedStatus === key;
        const count = isStatus ? occurrences[key as VehicleStatus] : 1;

        return (
          <button
            key={key}
            type="button"
            disabled={!isStatus}
            onClick={() => isStatus && onSelectStatus(key as VehicleStatus)}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-xs font-medium shadow-sm transition-smooth",
              TONE_CLASSES[meta.tone],
              isStatus && "cursor-pointer hover:brightness-95",
              selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            style={{
              left: `${(pos.x / VIEWBOX_W) * 100}%`,
              top: `${(pos.y / VIEWBOX_H) * 100}%`,
              width: NODE_W,
              height: NODE_H,
            }}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
            <span className="text-[10px] font-normal opacity-70">{count} occurrence{count === 1 ? "" : "s"}</span>
          </button>
        );
      })}
    </div>
  );
}
