import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BatteryMedium, Eye, Plus, Wrench, CheckCircle2, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchBar } from "@/components/common/SearchBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { VehicleFormDialog } from "@/components/vehicles/VehicleFormDialog";
import { useVehicles, useCreateVehicle, useUpdateVehicle } from "@/hooks/useVehicles";
import type { Vehicle, VehicleStatus } from "@/types";

const STATUS_OPTIONS: (VehicleStatus | "all")[] = ["all", "available", "booked", "assigned", "maintenance", "scrap"];

export default function VehicleListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useVehicles({ search, status, page, pageSize: 8 });
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();

  const columns: DataTableColumn<Vehicle>[] = [
    {
      header: "Vehicle",
      key: "name",
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{v.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {v.manufacturer} {v.model} · {v.registration_number}
          </p>
        </div>
      ),
    },
    {
      header: "Battery",
      key: "battery",
      render: (v) => (
        <div className="flex items-center gap-1.5">
          <BatteryMedium className="h-4 w-4 text-muted-foreground" />
          {v.battery_percentage}%
        </div>
      ),
    },
    { header: "Status", key: "status", render: (v) => <StatusBadge status={v.status} /> },
    { header: "VIN", key: "vin", render: (v) => v.vin, hideOnMobile: true },
    {
      header: "Next service",
      key: "service",
      render: (v) => v.next_service_due_date ?? "—",
      hideOnMobile: true,
    },
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
              <Eye className="mr-2 h-4 w-4" /> View details
            </DropdownMenuItem>
            {v.status !== "maintenance" && (
              <DropdownMenuItem onClick={() => updateVehicle.mutate({ id: v.id, patch: { status: "maintenance" } })}>
                <Wrench className="mr-2 h-4 w-4" /> Mark in maintenance
              </DropdownMenuItem>
            )}
            {v.status !== "available" && (
              <DropdownMenuItem onClick={() => updateVehicle.mutate({ id: v.id, patch: { status: "available" } })}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark available
              </DropdownMenuItem>
            )}
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
          onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
          emptyTitle="No vehicles match your filters"
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
    </div>
  );
}
