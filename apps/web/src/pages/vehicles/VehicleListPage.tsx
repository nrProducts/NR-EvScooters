import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, Pencil, Ban, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchBar } from "@/components/common/SearchBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { BatteryIndicator } from "@/components/common/BatteryIndicator";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useVehicles, useDeleteVehicle, useUpdateVehicleStatus } from "@/hooks/useVehicles";
import { useAuthStore } from "@/store/authStore";
import type { Vehicle, VehicleStatus } from "@/types";
import { MoreHorizontal } from "lucide-react";
import { CreateVehicleDialog } from "./CreateVehicleDialog";

const STATUS_OPTIONS: (VehicleStatus | "all")[] = [
  "all", "available", "booked", "assigned", "charging", "maintenance", "scrap", "offline",
];

export default function VehicleListPage() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  const { data, isLoading, isError, refetch } = useVehicles({ search, status, page, pageSize: 8 });
  const deleteVehicle = useDeleteVehicle();
  const updateStatus = useUpdateVehicleStatus();

  const columns: DataTableColumn<Vehicle>[] = [
    {
      header: "Vehicle",
      key: "reg",
      render: (v) => (
        <div>
          <p className="font-medium">{v.registrationNumber}</p>
          <p className="text-xs text-muted-foreground">{v.model}</p>
        </div>
      ),
    },
    { header: "Status", key: "status", render: (v) => <StatusBadge status={v.status} /> },
    { header: "Battery", key: "battery", render: (v) => <BatteryIndicator percent={v.batteryPercent} />, hideOnMobile: true },
    { header: "Station", key: "station", render: (v) => v.station ?? "—", hideOnMobile: true },
    { header: "Odometer", key: "odo", render: (v) => `${v.odometerKm.toLocaleString()} km`, hideOnMobile: true },
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
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/vehicles/${v.id}`)}>
              <Eye className="mr-2 h-4 w-4" /> View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/vehicles/${v.id}?edit=1`)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            {v.status !== "maintenance" && (
              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: v.id, status: "maintenance" })}>
                <Ban className="mr-2 h-4 w-4" /> Disable (maintenance)
              </DropdownMenuItem>
            )}
            {role === "admin" && (
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(v)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} vehicles in the fleet</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Add vehicle
        </Button>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by registration number or VIN..."
            className="sm:max-w-xs"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as VehicleStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
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
          onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
          emptyTitle="No vehicles match your filters"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <CreateVehicleDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.registrationNumber}?`}
        description="This will permanently remove the vehicle from the fleet. This cannot be undone."
        confirmLabel="Delete vehicle"
        destructive
        loading={deleteVehicle.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteVehicle.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
}
