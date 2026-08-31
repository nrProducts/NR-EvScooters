import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { useHolidays, useCreateHoliday, useUpdateHoliday, useDeleteHoliday } from "@/hooks/useHolidays";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import { ApiError } from "@/services/api/httpClient";
import { formatDate } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { CreateHolidayInput, Holiday, UpdateHolidayInput } from "@/services/api/holidays";

type HolidayRow = Holiday & { id: string };

export default function HolidaysPage() {
  const user = useAuthStore((s) => s.user);
  const canManage = hasAction(user, "holidays", "manage");
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holiday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const { data, isLoading, isError, refetch } = useHolidays({
    page, pageSize, upcoming: scope === "upcoming" ? true : undefined,
  });
  const createHoliday = useCreateHoliday();
  const updateHoliday = useUpdateHoliday();
  const deleteHoliday = useDeleteHoliday();

  usePageSubtitle("Government/public holidays — automatically excluded from leave-day calculation");

  const openCreate = () => { setEditTarget(null); setFormOpen(true); };
  const openEdit = (holiday: Holiday) => { setEditTarget(holiday); setFormOpen(true); };

  const columns: DataTableColumn<HolidayRow>[] = [
    { header: "Name", key: "name", render: (h) => h.name },
    { header: "Date", key: "date", render: (h) => formatDate(h.holiday_date) },
    { header: "Description", key: "description", render: (h) => h.description || "—", hideOnMobile: true },
    { header: "Status", key: "status", render: (h) => <StatusBadge status={h.is_active ? "active" : "inactive"} /> },
    {
      header: "",
      key: "actions",
      render: (h) =>
        canManage ? (
          <div className="flex gap-1.5">
            <IconButton size="sm" variant="ghost" label="Edit holiday" onClick={() => openEdit(h)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              label="Delete holiday"
              className="text-destructive"
              onClick={() => setDeleteTarget(h)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  const rows: HolidayRow[] = (data?.data ?? []).map((h) => ({ ...h }));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <Select value={scope} onValueChange={(v) => { setScope(v as "upcoming" | "all"); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming holidays</SelectItem>
            <SelectItem value="all">All holidays</SelectItem>
          </SelectContent>
        </Select>

        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add holiday
          </Button>
        )}
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle={scope === "upcoming" ? "No upcoming holidays" : "No holidays recorded yet"}
        />
        {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}
      </Card>

      <HolidayFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditTarget(null); }}
        holiday={editTarget}
        isPending={editTarget ? updateHoliday.isPending : createHoliday.isPending}
        error={editTarget ? updateHoliday.error : createHoliday.error}
        onSubmit={(payload) => {
          const onSuccess = () => {
            toastSuccess(editTarget ? "Holiday updated" : "Holiday added");
            setFormOpen(false);
            setEditTarget(null);
          };
          const onError = (err: unknown) => toastError(err, editTarget ? "Could not update holiday" : "Could not add holiday");
          if (editTarget) updateHoliday.mutate({ id: editTarget.id, input: payload }, { onSuccess, onError });
          else createHoliday.mutate(payload, { onSuccess, onError });
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? "this holiday"}?`}
        description="This date will no longer be excluded from leave-day calculation."
        confirmLabel="Delete"
        destructive
        loading={deleteHoliday.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteHoliday.mutate(
            { id: deleteTarget.id, name: deleteTarget.name },
            {
              onSuccess: () => {
                toastSuccess("Holiday deleted");
                setDeleteTarget(null);
              },
              onError: (err) => toastError(err, "Could not delete holiday"),
            },
          );
        }}
      />
    </div>
  );
}

function HolidayFormDialog({
  open, onOpenChange, holiday, isPending, error, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: Holiday | null;
  isPending: boolean;
  error: unknown;
  onSubmit: (payload: CreateHolidayInput & UpdateHolidayInput) => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Reset the form whenever the dialog opens (either fresh, for create, or
  // against a different row, for edit) — same pattern as BatteryStationForm.
  useEffect(() => {
    if (!open) return;
    setName(holiday?.name ?? "");
    setDate(holiday?.holiday_date ?? "");
    setDescription(holiday?.description ?? "");
    setIsActive(holiday?.is_active ?? true);
  }, [open, holiday]);

  const canSubmit = name.trim().length >= 2 && !!date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{holiday ? "Edit holiday" : "Add holiday"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Holiday name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Holiday name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive holidays are kept for the record but no longer excluded from leave calculation.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
          </div>

          {!!error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error instanceof ApiError ? error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                holiday_date: date,
                description: description.trim() || undefined,
                is_active: isActive,
              })
            }
          >
            {isPending && <Spinner className="h-4 w-4" />}
            {holiday ? "Save" : "Add holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
