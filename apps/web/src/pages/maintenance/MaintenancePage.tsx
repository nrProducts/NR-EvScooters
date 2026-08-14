import { useState } from "react";
import { Plus, CheckCircle2, PlayCircle, XCircle, MoreHorizontal, Loader2, ClipboardCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TriageDialog } from "@/components/maintenance/TriageDialog";
import { useMaintenanceTickets, useCreateMaintenanceTicket, useUpdateMaintenanceTicket } from "@/hooks/useMaintenance";
import { useTableSort } from "@/hooks/useTableSort";
import { useVehicles } from "@/hooks/useVehicles";
import { ApiError } from "@/services/api/httpClient";
import { formatDate, formatDateTime } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { MaintenanceStatus, MaintenanceTicket } from "@/types";

const STATUS_OPTIONS: (MaintenanceStatus | "all")[] = ["all", "reported", "in_progress", "resolved", "cancelled"];

export default function MaintenancePage() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<MaintenanceStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useMaintenanceTickets({
    status, page, pageSize: 8, sortBy: "created_at", sortDir: sort.dir,
  });
  const updateTicket = useUpdateMaintenanceTicket();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [triageTarget, setTriageTarget] = useState<MaintenanceTicket | null>(null);

  const handleUpdate = (id: string, ticketStatus: MaintenanceStatus) => {
    setUpdateError(null);
    updateTicket.mutate(
      { id, status: ticketStatus },
      {
        onError: (err) =>
          setUpdateError(err instanceof ApiError ? err.message : "Could not update this ticket."),
      },
    );
  };

  const columns: DataTableColumn<MaintenanceTicket>[] = [
    {
      header: "Vehicle",
      key: "vehicle",
      render: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{t.vehicle?.name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{t.vehicle?.registration_number ?? ""}</p>
        </div>
      ),
    },
    {
      header: "Issue",
      key: "description",
      render: (t) => <p className="max-w-xs truncate">{t.description}</p>,
    },
    { header: "Status", key: "status", render: (t) => <StatusBadge status={t.status} /> },
    {
      header: "Outcome",
      key: "outcome",
      render: (t) => {
        if (!t.outcome) return <span className="text-xs text-muted-foreground">Not triaged</span>;
        if (t.outcome === "quick_fix") {
          return (
            <span className="text-xs">
              Quick fix{t.expected_ready_at && ` · ready ${formatDateTime(t.expected_ready_at)}`}
            </span>
          );
        }
        if (t.outcome === "standard_temp") {
          return <span className="text-xs">Temp vehicle: {t.temp_vehicle?.name ?? "—"}</span>;
        }
        return <span className="text-xs">Not repairable</span>;
      },
      hideOnMobile: true,
    },
    { header: "Reported by", key: "reported_by", render: (t) => t.reported_by?.full_name ?? "—", hideOnMobile: true },
    { header: "Reported", key: "created_at", sortKey: "created_at", render: (t) => formatDate(t.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (t) => {
        const canEdit = hasAction(user, "maintenance", "edit");
        const canTriage = canEdit || hasAction(user, "maintenance", "complete");
        const showTriage = t.status !== "cancelled" && !t.outcome && canTriage;
        const showStartWork = t.status !== "in_progress" && t.status !== "cancelled" && canEdit;
        const showResolved = canEdit;
        const showCancel = t.status !== "cancelled" && canEdit;
        // Every item below is gated on status !== "resolved" and the current
        // user's permissions, so a resolved ticket — or a ticket where the
        // user has none of the relevant actions — has nothing to show;
        // render a dash instead of an empty dropdown (an empty
        // DropdownMenuContent has no content to size itself against, so it
        // opens mispositioned/invisible).
        if (t.status === "resolved" || !(showTriage || showStartWork || showResolved || showCancel)) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {showTriage && (
                <DropdownMenuItem onClick={() => setTriageTarget(t)}>
                  <ClipboardCheck className="mr-2 h-4 w-4" /> Triage
                </DropdownMenuItem>
              )}
              {showStartWork && (
                <DropdownMenuItem onClick={() => handleUpdate(t.id, "in_progress")}>
                  <PlayCircle className="mr-2 h-4 w-4" /> Start work
                </DropdownMenuItem>
              )}
              {showResolved && (
                <DropdownMenuItem onClick={() => handleUpdate(t.id, "resolved")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark resolved
                </DropdownMenuItem>
              )}
              {showCancel && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => handleUpdate(t.id, "cancelled")}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Cancel
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} tickets · service requests, inspections and repairs</p>
        </div>
        {hasAction(user, "maintenance", "create") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Report issue
          </Button>
        )}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as MaintenanceStatus | "all");
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

        {updateError && (
          <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{updateError}</p>
        )}

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No maintenance tickets"
          emptyDescription="Nothing has been reported for the fleet yet."
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TriageDialog ticket={triageTarget} onOpenChange={(o) => !o && setTriageTarget(null)} />
    </div>
  );
}

function CreateTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const { data: vehicles } = useVehicles({ pageSize: 100 });
  const createTicket = useCreateMaintenanceTicket();

  const canSubmit = vehicleId && description.trim().length >= 3;

  const reset = () => {
    setVehicleId("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a maintenance issue</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {(vehicles?.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} · {v.registration_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Describe the issue</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>

          {createTicket.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {createTicket.error instanceof ApiError ? createTicket.error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || createTicket.isPending}
            onClick={() =>
              createTicket.mutate(
                { vehicle_id: vehicleId, description: description.trim() },
                { onSuccess: () => { reset(); onOpenChange(false); } },
              )
            }
          >
            {createTicket.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Report issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
