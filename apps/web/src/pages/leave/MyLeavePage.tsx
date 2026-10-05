import { useState } from "react";
import { Plus, X, Check, CalendarOff, PartyPopper, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import {
  useMyLeaveBalance, useMyLeaveRequests, useLeaveTypes, useApplyForLeave, useCancelMyLeaveRequest, useLeavePreview,
} from "@/hooks/useLeave";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import { formatDate } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { LeaveDayBreakdown, LeaveRequest } from "@/services/api/leave";

export default function MyLeavePage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [applyOpen, setApplyOpen] = useState(false);

  const { data: balance } = useMyLeaveBalance();
  const { data, isLoading, isError, refetch } = useMyLeaveRequests({ page, pageSize });
  const cancelRequest = useCancelMyLeaveRequest();

  usePageSubtitle("Your leave");

  const columns: DataTableColumn<LeaveRequest>[] = [
    { header: "Type", key: "type", render: (r) => r.leave_type.name },
    { header: "Dates", key: "dates", render: (r) => `${formatDate(r.start_date)} – ${formatDate(r.end_date)}` },
    { header: "Days", key: "days", render: (r) => r.days },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    {
      header: "",
      key: "actions",
      render: (r) =>
        r.status === "pending" ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={cancelRequest.isPending}
            onClick={() =>
              cancelRequest.mutate(r.id, {
                onSuccess: () => toastSuccess("Leave request cancelled"),
                onError: (err) => toastError(err, "Could not cancel leave request"),
              })
            }
          >
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {balance && balance.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {balance.map((b) => (
            <StatCard key={b.id} label={b.name} value={`${b.remaining_days}/${b.annual_quota_days}`} />
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setApplyOpen(true)}>
          <Plus className="h-4 w-4" /> Apply for leave
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No leave requests yet"
        />
        {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}
      </Card>

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </div>
  );
}

/** "2026-08-15" -> "Fri" / "15 Aug". Same date-only string parsing as formatDate() in lib/utils. */
function weekdayOf(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(new Date(dateStr));
}
function shortDay(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(new Date(dateStr));
}

const DAY_CARD_STYLE: Record<"leave" | "excluded" | "blocked", string> = {
  leave: "border-primary/30 bg-primary/5",
  excluded: "border-border bg-muted/40",
  blocked: "border-destructive/40 bg-destructive/5",
};

function LeaveDayCard({ day }: { day: LeaveDayBreakdown }) {
  const variant = day.already_applied ? "blocked" : day.kind === "leave" ? "leave" : "excluded";
  return (
    <div className={`flex min-w-[92px] shrink-0 flex-col items-center gap-1 rounded-lg border px-2.5 py-2 text-center ${DAY_CARD_STYLE[variant]}`}>
      <span className="text-[0.6875rem] font-medium text-muted-foreground">{weekdayOf(day.date)}</span>
      <span className="text-sm font-semibold">{shortDay(day.date)}</span>
      {day.already_applied ? (
        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-destructive">
          <AlertCircle className="h-3 w-3" /> Already Applied
        </span>
      ) : day.kind === "leave" ? (
        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-primary">
          <Check className="h-3 w-3" /> Leave
        </span>
      ) : day.kind === "week_off" ? (
        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground">
          <CalendarOff className="h-3 w-3" /> Week Off
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground" title={day.holiday_name}>
          <PartyPopper className="h-3 w-3" /> Holiday
        </span>
      )}
      {day.kind !== "leave" && !day.already_applied && <span className="text-[0.625rem] text-muted-foreground">Not counted</span>}
    </div>
  );
}

function ApplyLeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const { data: types } = useLeaveTypes();
  const applyForLeave = useApplyForLeave();
  // Frontend validation is a courtesy — applyForLeave (and previewMyLeave's
  // own backend logic) re-checks everything server-side regardless, since a
  // client could call POST /leave/me directly without ever previewing.
  const { data: preview, isFetching: previewLoading } = useLeavePreview(startDate, endDate);

  const datesPicked = !!startDate && !!endDate && endDate >= startDate;
  const canSubmit =
    !!leaveTypeId && datesPicked && !previewLoading &&
    (!preview || (preview.leave_day_count > 0 && !preview.has_overlap));

  const reset = () => {
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { reset(); applyForLeave.reset(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Leave type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a leave type" />
              </SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.annual_quota_days} days/year)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              {startDate && <p className="text-[0.6875rem] text-muted-foreground">{formatDate(startDate)} ({weekdayOf(startDate)})</p>}
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {endDate && <p className="text-[0.6875rem] text-muted-foreground">{formatDate(endDate)} ({weekdayOf(endDate)})</p>}
            </div>
          </div>

          {datesPicked && preview && (
            <div className="space-y-2.5 rounded-lg border border-border p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {preview.days.map((d) => <LeaveDayCard key={d.date} day={d} />)}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">
                  Calendar Days: <span className="font-medium text-foreground">{preview.days.length}</span>
                </span>
                <span className="text-muted-foreground">
                  Leave Days: <span className="font-medium text-primary">{preview.leave_day_count}</span>
                </span>
                <span className="text-muted-foreground">
                  Week Off / Holiday: <span className="font-medium text-foreground">{preview.days.length - preview.leave_day_count}</span>
                </span>
              </div>

              {preview.leave_day_count === 0 && (
                <p className="text-xs text-destructive">
                  Every date in this range is a week off or a government holiday.
                </p>
              )}
              {preview.has_overlap && (
                <p className="text-xs text-destructive">
                  Leave has already been applied for one or more selected dates.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>

          {applyForLeave.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {applyForLeave.error instanceof ApiError ? applyForLeave.error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || applyForLeave.isPending}
            onClick={() =>
              applyForLeave.mutate(
                { leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, reason: reason.trim() || undefined },
                {
                  onSuccess: () => {
                    toastSuccess("Leave request submitted");
                    reset();
                    onOpenChange(false);
                  },
                  onError: (err) => toastError(err, "Could not submit leave request"),
                },
              )
            }
          >
            {applyForLeave.isPending && <Spinner className="h-4 w-4" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
