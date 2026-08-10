import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchBar } from "@/components/common/SearchBar";
import { Pagination } from "@/components/common/Pagination";
import { StationSummaryCards } from "@/components/battery-stations/StationSummaryCards";
import { BatteryStationGrid } from "@/components/battery-stations/BatteryStationGrid";
import { BatteryStationForm } from "@/components/battery-stations/BatteryStationForm";
import { DeleteStationDialog } from "@/components/battery-stations/DeleteStationDialog";
import { StationMapPreviewDialog } from "@/components/battery-stations/StationMapPreviewDialog";
import {
  useAdminStations, useCreateStation, useDeleteStation, useStationSummary,
  useUpdateStation, useUpdateStationVisibility,
} from "@/hooks/useBatteryStations";
import {
  BATTERY_STATION_STATUSES, STATION_STATUS_LABEL,
  type BatteryStation, type StationSortBy, type StationStatus, type StationVisibilityFilter,
} from "@/types/batteryStation";

const PAGE_SIZE = 10;

const SORT_OPTIONS: { value: `${StationSortBy}:${"asc" | "desc"}`; label: string }[] = [
  { value: "serialNumber:asc", label: "Serial number" },
  { value: "name:asc", label: "Name (A–Z)" },
  { value: "name:desc", label: "Name (Z–A)" },
  { value: "batteryCount:desc", label: "Most batteries" },
  { value: "batteryCount:asc", label: "Fewest batteries" },
  { value: "updatedAt:desc", label: "Recently updated" },
];

export default function BatteryStationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StationStatus | "all">("all");
  const [visibility, setVisibility] = useState<StationVisibilityFilter>("all");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("serialNumber:asc");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BatteryStation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BatteryStation | null>(null);
  const [mapTarget, setMapTarget] = useState<BatteryStation | null>(null);

  const [sortBy, sortDir] = sort.split(":") as [StationSortBy, "asc" | "desc"];

  const filters = { page, pageSize: PAGE_SIZE, search, status, visibility, sortBy, sortDir };
  const { data, isLoading, isError, refetch, isFetching } = useAdminStations(filters);
  const summary = useStationSummary();

  const createStation = useCreateStation();
  const updateStation = useUpdateStation();
  const updateVisibility = useUpdateStationVisibility();
  const deleteStation = useDeleteStation();

  /** Any filter change invalidates the current page number. */
  const resetToFirstPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (station: BatteryStation) => {
    setEditTarget(station);
    setFormOpen(true);
  };

  const refreshAll = () => {
    void refetch();
    void summary.refetch();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Battery Station Management</h1>
          <p className="text-sm text-muted-foreground">
            Add, edit and control which battery swap stations riders see on the mobile map.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshAll} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add station
          </Button>
        </div>
      </div>

      <StationSummaryCards summary={summary.data} isLoading={summary.isLoading} />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchBar
            value={search}
            onChange={resetToFirstPage(setSearch)}
            placeholder="Search by station name or QIS ID..."
            className="lg:max-w-xs"
          />

          <Select value={status} onValueChange={resetToFirstPage((v) => setStatus(v as StationStatus | "all"))}>
            <SelectTrigger className="lg:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {BATTERY_STATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATION_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={visibility}
            onValueChange={resetToFirstPage((v) => setVisibility(v as StationVisibilityFilter))}
          >
            <SelectTrigger className="lg:w-40">
              <SelectValue placeholder="Visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All visibility</SelectItem>
              <SelectItem value="visible">Visible on mobile</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={resetToFirstPage((v) => setSort(v as typeof sort))}>
            <SelectTrigger className="lg:w-48">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <BatteryStationGrid
          stations={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={refreshAll}
          onEdit={openEdit}
          onViewOnMap={setMapTarget}
          onToggleVisibility={(station) =>
            updateVisibility.mutate({ id: station.id, isVisible: !station.isVisibleOnMobile })
          }
          onDelete={setDeleteTarget}
          busyId={updateVisibility.isPending ? updateVisibility.variables?.id : null}
        />

        {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />}
      </Card>

      <BatteryStationForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditTarget(null);
        }}
        station={editTarget}
        isPending={editTarget ? updateStation.isPending : createStation.isPending}
        error={editTarget ? updateStation.error : createStation.error}
        onSubmit={(payload) => {
          const onSuccess = () => {
            setFormOpen(false);
            setEditTarget(null);
          };
          if (editTarget) updateStation.mutate({ id: editTarget.id, payload }, { onSuccess });
          else createStation.mutate(payload, { onSuccess });
        }}
      />

      <DeleteStationDialog
        station={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        isPending={deleteStation.isPending}
        onConfirm={(station) =>
          deleteStation.mutate(
            { id: station.id, name: station.name },
            { onSuccess: () => setDeleteTarget(null) },
          )
        }
      />

      <StationMapPreviewDialog station={mapTarget} onOpenChange={(open) => !open && setMapTarget(null)} />
    </div>
  );
}
