import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { useLeaveRequests, useApproveLeaveRequest, useRejectLeaveRequest } from "@/hooks/useLeave";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import { formatDate } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { AdminLeaveRequest, LeaveRequestStatus } from "@/services/api/leave";

const STATUS_OPTIONS: (LeaveRequestStatus | "all")[] = ["all", "pending", "approved", "rejected", "cancelled"];

export default function AdminLeavePage() {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<LeaveRequestStatus | "all">("pending");
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<AdminLeaveRequest | null>(null);
  const pageSize = 10;

  const { data, isLoading, isError, refetch } = useLeaveRequests({
    page, pageSize, status: status === "all" ? undefined : status,
  });
  const approveRequest = useApproveLeaveRequest();
  const canApprove = hasAction(user, "leave", "approve");

  usePageSubtitle("Staff leave requests");

  const columns: DataTableColumn<AdminLeaveRequest>[] = [
    { header: "Staff", key: "staff", render: (r) => r.user.full_name },
    { header: "Type", key: "type", render: (r) => r.leave_type.name },
    { header: "Dates", key: "dates", render: (r) => `${formatDate(r.start_date)} – ${formatDate(r.end_date)}` },
    { header: "Days", key: "days", render: (r) => r.days },
    { header: "Reason", key: "reason", render: (r) => r.reason ?? "—", hideOnMobile: true },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    {
      header: "Actions",
      key: "actions",
      render: (r) => {
        if (r.status !== "pending" || !canApprove) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={approveRequest.isPending}
              onClick={() =>
                approveRequest.mutate(
                  { id: r.id },
                  {
                    onSuccess: () => toastSuccess("Leave request approved"),
                    onError: (err) => toastError(err, "Could not approve leave request"),
                  },
                )
              }
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setRejectTarget(r)}>
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={status}
            onValueChange={(v) => { setStatus(v as LeaveRequestStatus | "all"); setPage(1); }}
          >
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {approveRequest.isError && (
          <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {approveRequest.error instanceof ApiError ? approveRequest.error.message : "Could not approve this request."}
          </p>
        )}

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No leave requests match these filters"
        />
        {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPageChange={setPage} />}
      </Card>

      <RejectDialog request={rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)} />
    </div>
  );
}

function RejectDialog({
  request,
  onOpenChange,
}: {
  request: AdminLeaveRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const rejectRequest = useRejectLeaveRequest();

  return (
    <Dialog
      open={!!request}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setNote(""); rejectRequest.reset(); } }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject leave request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {request?.user.full_name} · {request?.leave_type.name}
            {request && ` · ${formatDate(request.start_date)} – ${formatDate(request.end_date)}`}
          </p>
          <div className="space-y-1.5">
            <Label>Reason for rejection</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="At least 3 characters" />
          </div>

          {rejectRequest.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rejectRequest.error instanceof ApiError ? rejectRequest.error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={note.trim().length < 3 || rejectRequest.isPending || !request}
            onClick={() =>
              request &&
              rejectRequest.mutate(
                { id: request.id, reviewNote: note.trim() },
                {
                  onSuccess: () => {
                    toastSuccess("Leave request rejected");
                    onOpenChange(false);
                  },
                  onError: (err) => toastError(err, "Could not reject leave request"),
                },
              )
            }
          >
            {rejectRequest.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
