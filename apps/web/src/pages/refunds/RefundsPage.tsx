import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, Search, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowActionsButton } from "@/components/ui/row-actions-button";
import {
  useRefunds, useRetryRefund, useReviewRefund, useRejectRefund,
} from "@/hooks/useRefunds";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { Refund, RefundStatus, RefundType } from "@/types";

const STATUS_OPTIONS: (RefundStatus | "all")[] = [
  "all", "pending", "processing", "succeeded", "failed", "rejected",
];
const REFUND_TYPE_OPTIONS: (RefundType | "all")[] = [
  "all", "deposit_release", "booking_cancellation", "settlement", "goodwill",
];
const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  deposit_release: "Deposit Release",
  booking_cancellation: "Booking Cancellation",
  settlement: "Return Settlement",
  goodwill: "Goodwill",
};

export default function RefundsPage() {
  const [status, setStatus] = useState<RefundStatus | "all">("all");
  const [refundType, setRefundType] = useState<RefundType | "all">("all");
  const [page, setPage] = useState(1);
  const [reviewTarget, setReviewTarget] = useState<Refund | null>(null);
  const [approveTarget, setApproveTarget] = useState<Refund | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Refund | null>(null);
  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useRefunds({
    status, refundType, page, pageSize: 8, sortBy: sort.by as "created_at" | "amount", sortDir: sort.dir,
  });
  const retry = useRetryRefund();

  const columns: DataTableColumn<Refund>[] = [
    {
      header: "Source",
      key: "refund_type",
      render: (r) => <span className="text-sm">{REFUND_TYPE_LABEL[r.refund_type]}</span>,
    },
    {
      header: "Rider",
      key: "rider",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.booking?.rider_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{r.booking?.rider_phone ?? ""}</p>
        </div>
      ),
    },
    {
      header: "Booking",
      key: "booking_id",
      render: (r) => (r.booking_id ? (
        <Link
          to={`/payments?bookingId=${r.booking_id}`}
          className="text-sm underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.booking_id.slice(0, 8)}…
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      )),
      hideOnMobile: true,
    },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (r) => (
        <span className="text-sm">
          {r.booking?.vehicle_model_name ?? "—"}
          {r.booking?.station_name ? ` · ${r.booking.station_name}` : ""}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      header: "Original Amount",
      key: "gross_amount",
      sortKey: "amount",
      render: (r) => formatCurrency(r.gross_amount),
    },
    {
      header: "Deduction",
      key: "deduction_total",
      render: (r) => (r.deduction_total > 0
        ? <span className="text-destructive">-{formatCurrency(r.deduction_total)}</span>
        : <span className="text-muted-foreground">—</span>),
      hideOnMobile: true,
    },
    {
      header: "Refund Amount",
      key: "amount",
      render: (r) => <span className="font-semibold">{formatCurrency(r.amount)}</span>,
    },
    {
      header: "Reason",
      key: "reason",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.rejection_reason ?? r.booking?.cancellation_reason ?? r.review_note ?? "—"}
        </span>
      ),
      hideOnMobile: true,
    },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    {
      header: "Reviewed By",
      key: "reviewed_by",
      render: (r) => (
        <span className="text-xs">
          {r.reviewed_by?.full_name ?? "—"}
          {r.reviewed_at ? <span className="block text-muted-foreground">{formatDate(r.reviewed_at)}</span> : null}
        </span>
      ),
      hideOnMobile: true,
    },
    { header: "Initiated", key: "initiated_at", sortKey: "created_at", render: (r) => formatDate(r.initiated_at), hideOnMobile: true },
    { header: "Approved / Done", key: "processed_at", render: (r) => (r.processed_at ? formatDate(r.processed_at) : "—"), hideOnMobile: true },
    {
      header: "Transaction ID",
      key: "gateway_refund_id",
      render: (r) => <span className="font-mono text-xs">{r.gateway_refund_id ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      header: "Actions",
      key: "actions",
      className: "text-right",
      render: (r) => {
        const hasActions = r.status === "pending" || r.status === "failed";
        if (!hasActions) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <DropdownMenu>
            <RowActionsButton label="Refund actions" onClick={(e) => e.stopPropagation()} />
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {r.status === "pending" && (
                <>
                  <DropdownMenuItem onClick={() => setReviewTarget(r)}>
                    <Search className="mr-2 h-4 w-4" /> {r.reviewed_at ? "Adjust amount" : "Review"}
                  </DropdownMenuItem>
                  {r.reviewed_at && (
                    <DropdownMenuItem onClick={() => setApproveTarget(r)}>
                      <CheckCircle2 className="mr-2 h-4 w-4 text-success" /> Approve &amp; pay
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-destructive" onClick={() => setRejectTarget(r)}>
                    <XCircle className="mr-2 h-4 w-4" /> Reject
                  </DropdownMenuItem>
                </>
              )}
              {r.status === "failed" && (
                <DropdownMenuItem
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(r.id, {
                    onSuccess: () => toastSuccess("Refund retried"),
                    onError: (err) => toastError(err, "Could not retry refund"),
                  })}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry payout
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  usePageSubtitle(`${data?.total ?? 0} refunds — review, approve or reject each one`);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/bookings?tab=settled">Returns &amp; Settlements</Link>
        </Button>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={refundType}
            onValueChange={(v) => { setRefundType(v as RefundType | "all"); setPage(1); }}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {REFUND_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "all" ? "All sources" : REFUND_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => { setStatus(v as RefundStatus | "all"); setPage(1); }}
          >
            <SelectTrigger className="sm:w-48">
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

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No refunds match your filters"
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <ReviewRefundDialog refund={reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)} />
      <ApproveRefundDialog refund={approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)} />
      <RejectRefundDialog refund={rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review — itemise deductions, then mark reviewed.
// ---------------------------------------------------------------------------

const DEDUCTION_REASONS = [
  { value: "transaction_fee", label: "Transaction / gateway fee" },
  { value: "cancellation_charge", label: "Cancellation / late charge" },
  { value: "other_charges", label: "Other charge" },
] as const;
type DeductionReason = (typeof DEDUCTION_REASONS)[number]["value"];

function ReviewRefundDialog({ refund, onOpenChange }: { refund: Refund | null; onOpenChange: (open: boolean) => void }) {
  const review = useReviewRefund();

  const [payInput, setPayInput] = useState("");
  const [reason, setReason] = useState<DeductionReason>("other_charges");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!refund) return;
    // Prefill with the current payable, and whichever bucket already carries a deduction.
    setPayInput(String(refund.amount));
    const existing = (Object.keys(refund.deductions) as DeductionReason[]).find((k) => refund.deductions[k] > 0);
    setReason(existing ?? "other_charges");
    setNote(refund.review_note ?? "");
  }, [refund]);

  const gross = refund?.gross_amount ?? 0;
  const pay = Number(payInput);
  const payValid = payInput.trim() !== "" && Number.isFinite(pay);
  const withheld = payValid ? Math.round((gross - pay) * 100) / 100 : 0;
  const invalid = !payValid || pay < 0 || pay > gross;
  const wouldBeZero = payValid && pay <= 0;

  return (
    <Dialog open={!!refund} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Review refund — {refund?.booking?.rider_name ?? "rider"}</DialogTitle>
          <DialogDescription>
            {REFUND_TYPE_LABEL[refund?.refund_type ?? "goodwill"]}
            {refund?.booking?.cancelled_at ? ` · cancelled ${formatDate(refund.booking.cancelled_at)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Row label="Original amount" value={formatCurrency(gross)} strong />

          <div className="space-y-1">
            <Label className="text-xs">Refund amount to pay the rider (₹)</Label>
            <Input
              type="number" min={0} max={gross} value={payInput}
              onChange={(e) => setPayInput(e.target.value)}
            />
          </div>

          {withheld > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Withhold {formatCurrency(withheld)} as</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as DeductionReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEDUCTION_REASONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Note {withheld > 0 ? "(why part is withheld)" : "(optional)"}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. UPI gateway fee is non-refundable" />
          </div>

          <div className="rounded-lg bg-secondary/40 p-3">
            <Row label="Withheld" value={formatCurrency(Math.max(0, withheld))} />
            <Row label="Rider receives" value={formatCurrency(Math.max(0, payValid ? pay : gross))} strong />
          </div>

          {invalid && !wouldBeZero && (
            <p className="text-xs text-destructive">
              Enter an amount between {formatCurrency(0)} and {formatCurrency(gross)}.
            </p>
          )}
          {wouldBeZero && (
            <p className="text-xs text-destructive">Nothing would be paid — use Reject instead.</p>
          )}
        </div>

        {review.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {review.error instanceof ApiError ? review.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={review.isPending || invalid || !refund}
            onClick={() => {
              if (!refund) return;
              const deductions = { transaction_fee: 0, other_charges: 0, cancellation_charge: 0 };
              if (withheld > 0) deductions[reason] = withheld;
              review.mutate(
                { id: refund.id, input: { deductions, note: note.trim() || undefined } },
                {
                  onSuccess: () => { toastSuccess("Refund reviewed — ready for approval"); onOpenChange(false); },
                  onError: (err) => toastError(err, "Could not save review"),
                },
              );
            }}
          >
            {review.isPending ? "Saving…" : "Save & Mark Reviewed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Approve — send the reviewed net amount to the gateway.
// ---------------------------------------------------------------------------

function ApproveRefundDialog({ refund, onOpenChange }: { refund: Refund | null; onOpenChange: (open: boolean) => void }) {
  const retry = useRetryRefund();

  return (
    <Dialog open={!!refund} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve refund of {refund ? formatCurrency(refund.amount) : ""}?</DialogTitle>
          <DialogDescription>
            {refund?.booking?.rider_name ?? "This rider"} — {REFUND_TYPE_LABEL[refund?.refund_type ?? "goodwill"]}
          </DialogDescription>
        </DialogHeader>

        {refund && (
          <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
            <Row label="Original amount" value={formatCurrency(refund.gross_amount)} />
            {refund.deductions.transaction_fee > 0 && (
              <Row label="Transaction fee" value={`-${formatCurrency(refund.deductions.transaction_fee)}`} muted />
            )}
            {refund.deductions.other_charges > 0 && (
              <Row label="Other charges" value={`-${formatCurrency(refund.deductions.other_charges)}`} muted />
            )}
            {refund.deductions.cancellation_charge > 0 && (
              <Row label="Cancellation charge" value={`-${formatCurrency(refund.deductions.cancellation_charge)}`} muted />
            )}
            <div className="h-px bg-border" />
            <Row label="Net refund" value={formatCurrency(refund.amount)} strong />
            {refund.reviewed_by && (
              <p className="pt-1 text-[0.6875rem] text-muted-foreground">
                Reviewed by {refund.reviewed_by.full_name}
                {refund.reviewed_at ? ` on ${formatDate(refund.reviewed_at)}` : ""}
                {refund.review_note ? ` — ${refund.review_note}` : ""}
              </p>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {refund?.source_gateway_payment_id?.startsWith("manual_")
            ? `The original payment was collected offline, so this records ${refund ? formatCurrency(refund.amount) : "the refund"} as paid back in cash at the hub — no gateway transfer. This can't be undone.`
            : `This sends ${refund ? formatCurrency(refund.amount) : "the refund"} to the rider's original payment method via Razorpay. This can't be undone.`}
        </p>

        {retry.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {retry.error instanceof ApiError ? retry.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={retry.isPending}
            onClick={() => {
              if (!refund) return;
              retry.mutate(refund.id, {
                onSuccess: () => { toastSuccess("Refund approved and processed"); onOpenChange(false); },
                onError: (err) => toastError(err, "Could not process refund"),
              });
            }}
          >
            {retry.isPending
              ? "Approving…"
              : refund?.source_gateway_payment_id?.startsWith("manual_")
                ? "Approve — Cash Refunded"
                : "Approve & Process Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

function RejectRefundDialog({ refund, onOpenChange }: { refund: Refund | null; onOpenChange: (open: boolean) => void }) {
  const reject = useRejectRefund();
  const [reason, setReason] = useState("");

  useEffect(() => { if (refund) setReason(""); }, [refund]);

  return (
    <Dialog open={!!refund} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this {formatCurrency(refund?.amount ?? 0)} refund?</DialogTitle>
          <DialogDescription>
            No money moves. The refund is closed as <b>Rejected</b>,
            {" "}{refund?.booking?.rider_name ?? "the rider"} is notified with your reason, and any held deposit stays
            held. Use this when the refund isn&apos;t owed — to pay a smaller amount instead, use Review. This is final
            (a new refund would have to be raised to reverse it).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="text-xs">Reason (at least 3 characters) — the rider sees this</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cancellation outside the free window — fee retained per policy" />
        </div>

        {reject.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {reject.error instanceof ApiError ? reject.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep</Button>
          <Button
            variant="destructive"
            disabled={reject.isPending || reason.trim().length < 3}
            onClick={() => {
              if (!refund) return;
              reject.mutate(
                { id: refund.id, reason: reason.trim() },
                {
                  onSuccess: () => { toastSuccess("Refund rejected"); onOpenChange(false); },
                  onError: (err) => toastError(err, "Could not reject refund"),
                },
              );
            }}
          >
            {reject.isPending ? "Rejecting…" : "Reject Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-xs text-muted-foreground" : "text-sm"}>{label}</span>
      <span className={strong ? "text-sm font-bold" : muted ? "text-xs text-muted-foreground" : "text-sm font-medium"}>
        {value}
      </span>
    </div>
  );
}
