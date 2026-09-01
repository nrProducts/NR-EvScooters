import { useState } from "react";
import { AlertTriangle, ShieldAlert, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { Pagination } from "@/components/common/Pagination";
import { SideDrawer } from "@/components/common/SideDrawer";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  usePrivacyRequests, useUpdatePrivacyRequest, useRejectPrivacyRequest,
  useApproveErasure, useExecuteErasure,
} from "@/hooks/usePrivacyRequests";
import { useToastStore } from "@/store/toastStore";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatDate, formatDateTime } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import {
  DP_REQUEST_STATUS_LABELS, DP_REQUEST_TYPE_LABELS,
  type DpRequestStatus, type DpRequestType, type PrivacyRequest,
} from "@/types";

/**
 * The data-principal rights queue (DPDPA ss.11-14).
 *
 * Sorted oldest-due first by the backend on purpose: a queue sorted
 * newest-first is one where the request closest to breaching its published
 * response period is the hardest to find.
 */
export default function RightsQueuePage() {
  const [type, setType] = useState<DpRequestType | "all">("all");
  const [status, setStatus] = useState<DpRequestStatus | "all">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PrivacyRequest | null>(null);

  const { data, isLoading, isError, refetch } = usePrivacyRequests({
    type, status, overdueOnly, page, pageSize: 20,
  });

  const columns: DataTableColumn<PrivacyRequest>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium">{row.reference}</p>
          <p className="text-xs text-muted-foreground">{DP_REQUEST_TYPE_LABELS[row.type]}</p>
        </div>
      ),
    },
    {
      key: "rider",
      header: "Rider",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.rider?.full_name ?? "Erased account"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.rider?.phone ?? row.rider?.email ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={row.status} />
          {row.is_overdue && (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </span>
          )}
        </div>
      ),
    },
    {
      key: "sla_due_at",
      header: "Respond by",
      render: (row) => (
        <span className={row.is_overdue ? "text-xs font-medium text-destructive" : "text-xs"}>
          {formatDate(row.sla_due_at)}
        </span>
      ),
    },
    {
      key: "assigned_to",
      header: "Assignee",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.assigned_to?.full_name ?? "Unassigned"}
        </span>
      ),
    },
  ];

  usePageSubtitle(
    "Access, correction, erasure and grievance requests from riders. Each has a published response period we have committed to in the privacy notice.",
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <FilterBar
          filters={
            <>
              <Select value={type} onValueChange={(v) => { setType(v as DpRequestType | "all"); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Any type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any type</SelectItem>
                  {Object.entries(DP_REQUEST_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(v) => { setStatus(v as DpRequestStatus | "all"); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Any status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  {Object.entries(DP_REQUEST_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={overdueOnly ? "default" : "outline"}
                onClick={() => { setOverdueOnly(!overdueOnly); setPage(1); }}
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Overdue only
              </Button>
            </>
          }
        />
        <CardContent className="p-0">
          <DataTable
            data={data?.data ?? []}
            columns={columns}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
            onRowClick={setSelected}
            emptyTitle="No requests"
            emptyDescription="Nothing matches these filters."
          />
        </CardContent>
      </Card>

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}

      <RequestDrawer request={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function RequestDrawer({
  request,
  onClose,
}: {
  request: PrivacyRequest | null;
  onClose: () => void;
}) {
  const toast = useToastStore((s) => s.push);
  const user = useAuthStore((s) => s.user);
  // "process" governs the ordinary take-on/complete/reject actions. Erasure
  // approve/execute are requireAdmin on the backend regardless of module
  // grants (see privacy.routes.ts) — no staff permission can unlock those,
  // so they're gated on the actual role, not hasAction.
  const canProcess = hasAction(user, "privacy", "process");
  const isAdmin = user?.role === "admin";
  const update = useUpdatePrivacyRequest();
  const reject = useRejectPrivacyRequest();
  const approve = useApproveErasure();
  const execute = useExecuteErasure();

  const [notes, setNotes] = useState("");
  const [ticketRef, setTicketRef] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [forceReason, setForceReason] = useState("");

  if (!request) return null;

  const isOpen = ["open", "in_progress", "awaiting_principal"].includes(request.status);
  const graceOver = request.grace_ends_at ? new Date(request.grace_ends_at) <= new Date() : false;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast({ tone: "success", title: success, message: request.reference });
      onClose();
    } catch (err) {
      toast({ tone: "error", title: "Could not complete that", message: (err as Error).message });
    }
  };

  return (
    <>
      <SideDrawer open={!!request} onOpenChange={(o) => !o && onClose()} title={request.reference}>
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <Row label="Type" value={DP_REQUEST_TYPE_LABELS[request.type]} />
            <Row label="Status" value={DP_REQUEST_STATUS_LABELS[request.status]} />
            <Row label="Rider" value={request.rider?.full_name ?? "Erased account"} />
            <Row label="Raised" value={formatDateTime(request.created_at)} />
            <Row label="Respond by" value={formatDateTime(request.sla_due_at)} />
            {request.grace_ends_at && (
              <Row label="Grace ends" value={formatDateTime(request.grace_ends_at)} />
            )}
            <Row label="Channel" value={request.channel.replace(/_/g, " ")} />
          </div>

          {request.details && (
            <Block label="What the rider told us" body={request.details} />
          )}

          {request.requested_changes && (
            <Block
              label="Requested corrections"
              body={Object.entries(request.requested_changes)
                .map(([field, value]) => `${field.replace(/_/g, " ")}: ${value}`)
                .join("\n")}
            />
          )}

          {request.resolution_notes && (
            <Block label="Resolution sent to the rider" body={request.resolution_notes} />
          )}
          {request.rejection_reason && (
            <Block label="Rejection reason" body={request.rejection_reason} />
          )}

          {isOpen && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label>Resolution notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="This is sent to the rider — write it for them, not for us."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Helpdesk reference (optional)</Label>
                <Input
                  value={ticketRef}
                  onChange={(e) => setTicketRef(e.target.value)}
                  placeholder="Helpdesk reference"
                />
              </div>

              {canProcess && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() =>
                      void run(
                        () => update.mutateAsync({
                          id: request.id,
                          patch: {
                            status: "in_progress",
                            resolution_notes: notes || undefined,
                            ticket_ref: ticketRef || undefined,
                          },
                        }),
                        "Marked in progress",
                      )
                    }
                  >
                    Take it on
                  </Button>

                  {/* Erasure never completes by editing a status — it completes
                      when the data is actually destroyed. The backend refuses
                      the shortcut; the UI does not offer it. */}
                  {request.type !== "erasure" && (
                    <Button
                      disabled={update.isPending || notes.trim().length === 0}
                      onClick={() =>
                        void run(
                          () => update.mutateAsync({
                            id: request.id,
                            patch: { status: "completed", resolution_notes: notes },
                          }),
                          "Request completed",
                        )
                      }
                    >
                      Complete
                    </Button>
                  )}

                  <Button variant="outline" className="text-destructive hover:text-destructive"
                    onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                </div>
              )}

              {request.type === "erasure" && isAdmin && (
                <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-xs">
                      Erasure runs in two steps. <strong>Approve</strong> starts a cooling-off
                      window the rider can still cancel within. <strong>Execute</strong> destroys
                      their identity and cannot be undone.
                    </p>
                  </div>

                  {!request.grace_ends_at ? (
                    <Button
                      variant="outline"
                      disabled={approve.isPending}
                      onClick={() => setApproveOpen(true)}
                    >
                      Approve erasure
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      disabled={execute.isPending}
                      onClick={() => setExecuteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {graceOver ? "Execute erasure" : "Force erasure early"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SideDrawer>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this request?"
        description="Your reason is sent to the rider word for word. Write it for them."
        confirmLabel="Reject request"
        destructive
        disabled={rejectReason.trim().length < 10}
        onConfirm={() =>
          void run(
            () => reject.mutateAsync({ id: request.id, reason: rejectReason }),
            "Request rejected",
          )
        }
      >
        <Textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="At least 10 characters."
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="Approve this erasure?"
        description={
          "This starts a cooling-off window. Nothing is destroyed yet, and the rider can " +
          "still cancel. You will not be able to force it through early yourself."
        }
        confirmLabel="Approve"
        onConfirm={() => void run(() => approve.mutateAsync(request.id), "Erasure approved")}
      />

      <ConfirmDialog
        open={executeOpen}
        onOpenChange={setExecuteOpen}
        title="Erase this rider's identity?"
        description={
          "This destroys their name, contact details, address, photo and identity documents, " +
          "and cannot be undone. Invoices, payments, deposits and refunds are kept because " +
          "tax and company law require it, no longer linked to a name."
        }
        confirmLabel="Erase permanently"
        destructive
        disabled={!graceOver && forceReason.trim().length < 10}
        onConfirm={() =>
          void run(
            () => execute.mutateAsync({
              id: request.id,
              force: !graceOver,
              reason: graceOver ? undefined : forceReason,
            }),
            "Rider erased",
          )
        }
      >
        {!graceOver && (
          <div className="space-y-1.5">
            <Label>Why are you skipping the cooling-off window?</Label>
            <Textarea
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              rows={2}
              placeholder="Recorded in the audit log. At least 10 characters."
            />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium capitalize">{value}</span>
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap text-sm">{body}</p>
    </div>
  );
}
