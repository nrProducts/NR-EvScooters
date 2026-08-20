import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BatteryMedium, Eye, History, Plus, Wrench, CheckCircle2, MoreHorizontal, Loader2, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { SearchBar } from "@/components/common/SearchBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { VehicleFormDialog } from "@/components/vehicles/VehicleFormDialog";
import { VehicleHistoryDialog } from "@/components/vehicles/VehicleHistoryDialog";
import { AssignRiderPalette } from "@/components/vehicles/AssignRiderPalette";
import { useVehicles, useCreateVehicle, useUpdateVehicle } from "@/hooks/useVehicles";
import { useCreateMaintenanceTicket } from "@/hooks/useMaintenance";
import { useTableSort } from "@/hooks/useTableSort";
import { ApiError } from "@/services/api/httpClient";
import { formatDate } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { Vehicle, VehicleStatus } from "@/types";

const STATUS_OPTIONS: (VehicleStatus | "all")[] = ["all", "available", "reserved", "assigned", "maintenance", "retired"];

export default function VehicleListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<Vehicle | null>(null);
  const [issueDescription, setIssueDescription] = useState("");
  const [assignTarget, setAssignTarget] = useState<Vehicle | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new")) {
      setCreateOpen(true);
      setSearchParams((prev) => {
        prev.delete("new");
        return prev;
      }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useVehicles({
    search, status, page, pageSize: 8,
    sortBy: sort.by as "created_at" | "display_name" | "registration_number", sortDir: sort.dir,
  });
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const createMaintenanceTicket = useCreateMaintenanceTicket();

  const closeMaintenanceDialog = () => {
    setMaintenanceTarget(null);
    setIssueDescription("");
  };

  // Opening the ticket IS putting the scooter into maintenance.
  //
  // This used to open a ticket and then PATCH the vehicle's status, which was
  // two writes that could disagree — and the second one no longer does
  // anything: `recompute_vehicle_status()` derives the status from the open
  // ticket, and a trigger applies it in the same transaction as the insert.
  const confirmMaintenance = () => {
    if (!maintenanceTarget) return;
    createMaintenanceTicket.mutate(
      { vehicle_id: maintenanceTarget.id, description: issueDescription.trim() },
      { onSuccess: closeMaintenanceDialog },
    );
  };

  const columns: DataTableColumn<Vehicle>[] = [
    {
      header: "Vehicle",
      key: "name",
      sortKey: "display_name",
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{v.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {v.model} · {v.registration_number}
          </p>
        </div>
      ),
    },
    { header: "Status", key: "status", render: (v) => <StatusBadge status={v.status} /> },
    {
      header: "Payment",
      key: "payment_status",
      render: (v) => (v.payment_status ? <StatusBadge status={v.payment_status} /> : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "VIN",
      key: "vin",
      sortKey: "registration_number",
      render: (v) => v.vin,
      hideOnMobile: true,
    },
    { header: "Added", key: "created_at", sortKey: "created_at", render: (v) => formatDate(v.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (v) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => navigate(`/vehicles/${v.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHistoryTarget(v.id)}>
              <History className="mr-2 h-4 w-4" /> View history
            </DropdownMenuItem>
            {v.status === "available" && hasAction(user, "vehicles", "assign") && (
              <DropdownMenuItem onClick={() => setAssignTarget(v)}>
                <Zap className="mr-2 h-4 w-4" /> Assign to rider
              </DropdownMenuItem>
            )}
            {v.status !== "maintenance" && v.status !== "retired" && v.status !== "assigned" &&
              hasAction(user, "maintenance", "create") && (
              <DropdownMenuItem onClick={() => setMaintenanceTarget(v)}>
                <Wrench className="mr-2 h-4 w-4" /> Mark in maintenance
              </DropdownMenuItem>
            )}
            {/*
              "Mark available" is gone. `vehicles.status` is derived, so the
              way back to available is resolving the maintenance ticket that
              made it unavailable — which is what the Maintenance page does.
              A button here would have written a value the next recompute
              immediately overwrote.
            */}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} vehicles in the fleet</p>
        </div>
        {hasAction(user, "vehicles", "create") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name, registration or VIN..."
            className="sm:max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as VehicleStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={(v) => setHistoryTarget(v.id)}
          emptyTitle="No vehicles match your filters"
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <VehicleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isPending={createVehicle.isPending}
        error={createVehicle.error}
        onSubmit={(input) =>
          createVehicle.mutate(input, { onSuccess: () => setCreateOpen(false) })
        }
      />

      <Dialog open={!!maintenanceTarget} onOpenChange={(o) => !o && closeMaintenanceDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {maintenanceTarget?.name} in maintenance</DialogTitle>
            <DialogDescription>
              Describe the current issue. This opens a maintenance ticket and sets the vehicle status to
              "maintenance" until it's marked available again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Issue (at least 3 characters)</Label>
            <Textarea
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="e.g. Front brake making a grinding noise"
              rows={3}
            />
          </div>
          {(createMaintenanceTicket.isError || updateVehicle.isError) && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {createMaintenanceTicket.error instanceof ApiError
                ? createMaintenanceTicket.error.message
                : updateVehicle.error instanceof ApiError
                  ? updateVehicle.error.message
                  : "Something went wrong. Please try again."}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeMaintenanceDialog}>
              Cancel
            </Button>
            <Button
              disabled={issueDescription.trim().length < 3 || createMaintenanceTicket.isPending || updateVehicle.isPending}
              onClick={confirmMaintenance}
            >
              {(createMaintenanceTicket.isPending || updateVehicle.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Mark in maintenance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignRiderPalette vehicle={assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)} />
      <VehicleHistoryDialog vehicleId={historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)} />
    </div>
  );
}
