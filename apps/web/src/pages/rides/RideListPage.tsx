import { useState } from "react";
import { CheckCircle2, Wrench, MoreHorizontal, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useRentals, useCompleteRide, useMoveRideToMaintenance } from "@/hooks/useRentals";
import { ApiError } from "@/services/api/httpClient";
import { formatDateTime } from "@/lib/utils";
import type { AdminRental, RentalStatus } from "@/types";

const STATUS_OPTIONS: (RentalStatus | "all")[] = ["all", "active", "completed", "force_ended", "cancelled"];

function duration(startedAt: string, endedAt: string | null): string {
  const end = endedAt ? new Date(endedAt) : new Date();
  const ms = end.getTime() - new Date(startedAt).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function RideListPage() {
  const [status, setStatus] = useState<RentalStatus | "all">("active");
  const [page, setPage] = useState(1);
  const [maintenanceTarget, setMaintenanceTarget] = useState<AdminRental | null>(null);
  const [description, setDescription] = useState("");

  const { data, isLoading, isError, refetch } = useRentals({ status, page, pageSize: 8 });
  const completeRide = useCompleteRide();
  const moveToMaintenance = useMoveRideToMaintenance();

  const columns: DataTableColumn<AdminRental>[] = [
    { header: "Rider", key: "rider", render: (r) => r.rider?.full_name ?? "—" },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (r) => (
        <div>
          <p className="font-medium">{r.vehicle?.registration_number ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{r.vehicle?.name}</p>
        </div>
      ),
    },
    { header: "Started", key: "started", render: (r) => formatDateTime(r.started_at), hideOnMobile: true },
    { header: "Duration", key: "duration", render: (r) => duration(r.started_at, r.ended_at) },
    {
      header: "Battery",
      key: "battery",
      render: (r) => (r.status === "active" ? `${r.start_battery_pct ?? "—"}% start` : `${r.start_battery_pct ?? "—"}% → ${r.end_battery_pct ?? "—"}%`),
      hideOnMobile: true,
    },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    {
      header: "Actions",
      key: "actions",
      render: (r) =>
        r.status === "active" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => completeRide.mutate({ id: r.id })}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Complete ride
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setMaintenanceTarget(r);
                  setDescription("");
                }}
              >
                <Wrench className="mr-2 h-4 w-4" /> Move to maintenance
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rides</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} rides · live ride tracking and handovers</p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as RentalStatus | "all");
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
          emptyTitle="No rides in this stage"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <p className="text-xs text-muted-foreground">
        Distance and live location aren't shown — the fleet has no odometer or GPS telemetry wired up yet.
      </p>

      <Dialog open={!!maintenanceTarget} onOpenChange={(o) => !o && setMaintenanceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to maintenance</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Ends this ride and sends {maintenanceTarget?.vehicle?.registration_number} to maintenance instead of
            releasing it back into the available pool.
          </p>
          <div className="space-y-1.5">
            <Label>Issue description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {moveToMaintenance.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {moveToMaintenance.error instanceof ApiError ? moveToMaintenance.error.message : "Something went wrong."}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaintenanceTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={description.trim().length < 3 || moveToMaintenance.isPending}
              onClick={() => {
                if (maintenanceTarget) {
                  moveToMaintenance.mutate(
                    { id: maintenanceTarget.id, description: description.trim() },
                    { onSuccess: () => setMaintenanceTarget(null) },
                  );
                }
              }}
            >
              {moveToMaintenance.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Move to maintenance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
