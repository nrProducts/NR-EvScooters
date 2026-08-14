import { Eye, EyeOff, Map as MapIcon, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCoordinate } from "@/lib/mapConfig";
import { formatStationName, type BatteryStation, type StationStatus } from "@/types/batteryStation";

const STATUS_VARIANT: Record<StationStatus, "success" | "warning" | "destructive"> = {
  WORKING: "success",
  MAINTENANCE: "warning",
  NOT_WORKING: "destructive",
};

const STATUS_LABEL: Record<StationStatus, string> = {
  WORKING: "Working",
  MAINTENANCE: "Maintenance",
  NOT_WORKING: "Not working",
};

/** Shared with the mobile marker legend: never colour alone, always a word. */
export function StationStatusBadge({ status }: { status: StationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function BatteryStationGrid({
  stations,
  isLoading,
  isError,
  onRetry,
  onEdit,
  onViewOnMap,
  onToggleVisibility,
  onDelete,
  busyId,
  canEdit = true,
  canDelete = true,
}: {
  stations: BatteryStation[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onEdit: (station: BatteryStation) => void;
  onViewOnMap: (station: BatteryStation) => void;
  onToggleVisibility: (station: BatteryStation) => void;
  onDelete: (station: BatteryStation) => void;
  /** Station currently mid-mutation; its row actions are disabled. */
  busyId?: string | null;
  /** battery_stations.edit / battery_stations.delete — hide the corresponding row actions when false. */
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const columns: DataTableColumn<BatteryStation>[] = [
    {
      header: "S. No.",
      key: "serialNumber",
      render: (s) => <span className="font-medium tabular-nums">{s.serialNumber}</span>,
    },
    {
      header: "Station",
      key: "name",
      render: (s) => (
        <div className="min-w-0">
          {/* Underscores become spaces for reading only — the stored name is
              untouched, which is why the edit form shows the raw value. */}
          <p className="truncate font-medium">{formatStationName(s.name)}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{s.qisIds.join(", ")}</p>
        </div>
      ),
    },
    {
      header: "QIS ID(s)",
      key: "qisIds",
      hideOnMobile: true,
      render: (s) => (
        <div className="flex flex-col gap-0.5 font-mono text-xs">
          {s.qisIds.map((id) => (
            <span key={id}>{id}</span>
          ))}
        </div>
      ),
    },
    {
      header: "Latitude",
      key: "latitude",
      hideOnMobile: true,
      render: (s) => <span className="font-mono text-xs tabular-nums">{formatCoordinate(s.latitude)}</span>,
    },
    {
      header: "Longitude",
      key: "longitude",
      hideOnMobile: true,
      render: (s) => <span className="font-mono text-xs tabular-nums">{formatCoordinate(s.longitude)}</span>,
    },
    { header: "Status", key: "status", render: (s) => <StationStatusBadge status={s.status} /> },
    {
      header: "Batteries",
      key: "batteryCount",
      render: (s) => <span className="tabular-nums">{s.batteryCount}</span>,
    },
    {
      header: "Mobile",
      key: "visibility",
      render: (s) =>
        s.isVisibleOnMobile ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Eye className="h-3.5 w-3.5" /> Visible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="h-3.5 w-3.5" /> Hidden
          </span>
        ),
    },
    {
      header: "Last updated",
      key: "updatedAt",
      hideOnMobile: true,
      render: (s) => <span className="text-xs text-muted-foreground">{formatUpdatedAt(s.updatedAt)}</span>,
    },
    {
      header: "Actions",
      key: "actions",
      render: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${formatStationName(s.name)}`} disabled={busyId === s.id}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
              <DropdownMenuItem onClick={() => onEdit(s)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit station
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onViewOnMap(s)}>
              <MapIcon className="mr-2 h-4 w-4" /> View on map
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem onClick={() => onToggleVisibility(s)}>
                {s.isVisibleOnMobile ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" /> Hide on mobile
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" /> Show on mobile
                  </>
                )}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onClick={() => onDelete(s)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete station
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={stations}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      onRowClick={canEdit ? onEdit : undefined}
      emptyTitle="No battery stations match your filters"
      emptyDescription="Clear the search and filters, or add the first station."
    />
  );
}
