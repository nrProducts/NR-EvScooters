import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw, Search, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowActionsButton } from "@/components/ui/row-actions-button";
import { DepositJourneyDialog, journeyHeadline, vehicleNumbers } from "@/components/refunds/DepositJourneyDrawer";
import {
  useDepositJourneys, useRefundJourney, useRefunds, useRetryRefund, useReviewRefund, useRejectRefund,
} from "@/hooks/useRefunds";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatCurrency, formatFullDateTime } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { DepositJourney, DepositStatus, Refund, RefundStatus, RefundType } from "@/types";

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

type RefundsTab = "refunds" | "journeys";

export default function RefundsPage() {
  const [tab, setTab] = useState<RefundsTab>("refunds");
  const [status, setStatus] = useState<RefundStatus | "all">("all");
  const [refundType, setRefundType] = useState<RefundType | "all">("all");
  const [page, setPage] = useState(1);
  const [reviewTarget, setReviewTarget] = useState<Refund | null>(null);
  const [approveTarget, setApproveTarget] = useState<Refund | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Refund | null>(null);
  const [journeyRefundId, setJourneyRefundId] = useState<string | null>(null);
  const journey = useRefundJourney(journeyRefundId ?? undefined);
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
          {r.booking?.vehicle_registration_number ? <span className="block font-mono text-xs">{r.booking.vehicle_registration_number}</span> : null}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      header: "Refundable",
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
    {
      header: "Status",
      key: "status",
      // A failed refund shows WHY underneath. The API has always returned
      // failure_reason and nothing in this console rendered it, so the only
      // way to find out why a rider's money had not moved was to read the
      // database — and until the backend's describeGatewayError fix, the
      // answer waiting there was the string "[object Object]".
      render: (r) => (
        <div className="space-y-1">
          <StatusBadge status={r.status} />
          {r.status === "failed" && r.failure_reason ? (
            <p className="max-w-[16rem] text-xs text-destructive" title={r.failure_reason}>
              {r.failure_reason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      header: "Reviewed By",
      key: "reviewed_by",
      render: (r) => (
        <span className="text-xs">
          {r.reviewed_by?.full_name ?? "—"}
          {r.reviewed_at ? <span className="block text-muted-foreground">{formatFullDateTime(r.reviewed_at)}</span> : null}
        </span>
      ),
      hideOnMobile: true,
    },
    { header: "Initiated", key: "initiated_at", sortKey: "created_at", render: (r) => formatFullDateTime(r.initiated_at), hideOnMobile: true },
    { header: "Completed", key: "processed_at", render: (r) => (r.processed_at ? formatFullDateTime(r.processed_at) : "—"), hideOnMobile: true },
    {
      header: "Rejected",
      key: "rejected_at",
      render: (r) => (r.rejected_at ? (
        <span className="text-xs">
          {formatFullDateTime(r.rejected_at)}
          {r.rejected_by ? <span className="block text-muted-foreground">{r.rejected_by.full_name}</span> : null}
        </span>
      ) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Payout attempts",
      key: "attempt_count",
      render: (r) => (
        <span className="text-xs">
          {r.attempt_count}
          {r.last_attempted_at ? <span className="block text-muted-foreground">{formatFullDateTime(r.last_attempted_at)}</span> : null}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      header: "Original payment",
      key: "source_gateway_payment_id",
      render: (r) => <span className="font-mono text-xs">{r.source_gateway_payment_id ?? "—"}</span>,
      hideOnMobile: true,
    },
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

  usePageSubtitle(
    tab === "refunds"
      ? `${data?.total ?? 0} refunds — review, approve or reject each one`
      : "Every deposit from the rider's payment to the refund — dates, amounts and who handled it",
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as RefundsTab)}>
          <TabsList>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
            <TabsTrigger value="journeys">Deposit &amp; Refund Journey</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" asChild>
          <Link to="/bookings?tab=settled">Returns &amp; Settlements</Link>
        </Button>
      </div>

      {tab === "journeys" ? <JourneysTab /> : (
      <Card className="flex min-h-[20rem] flex-1 flex-col overflow-hidden">
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

        <DataTable fill
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No refunds match your filters"
          onRowClick={(r) => setJourneyRefundId(r.id)}
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>
      )}

      <DepositJourneyDialog
        open={!!journeyRefundId}
        onClose={() => setJourneyRefundId(null)}
        journey={journey.data}
        isLoading={journey.isLoading}
        isError={journey.isError}
      />
      <ReviewRefundDialog refund={reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)} />
      <ApproveRefundDialog refund={approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)} />
      <RejectRefundDialog refund={rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deposit & Refund Journey — one row per deposit, payment to refund.
// ---------------------------------------------------------------------------

const DEPOSIT_STATUS_OPTIONS: (DepositStatus | "all")[] = ["all", "pending", "held", "released", "forfeited"];

function JourneysTab() {
  const [status, setStatus] = useState<DepositStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DepositJourney | null>(null);
  const { data, isLoading, isError, refetch } = useDepositJourneys({ status, page, pageSize: 8 });

  const columns: DataTableColumn<DepositJourney>[] = [
    {
      header: "Rider",
      key: "rider",
      render: (j) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{j.rider?.full_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{j.rider?.phone ?? ""}</p>
        </div>
      ),
    },
    {
      header: "Scooter · Plan",
      key: "plan",
      hideOnMobile: true,
      render: (j) => (
        <div className="min-w-0 text-xs">
          <p className="truncate text-sm">{j.subscription.vehicle_model_name ?? "—"}</p>
          {vehicleNumbers(j) ? <p className="truncate font-mono">{vehicleNumbers(j)}</p> : null}
          <p className="truncate text-muted-foreground">
            {[j.subscription.plan_name, j.subscription.hub_name].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      header: "Paid",
      key: "paid",
      render: (j) => {
        const first = j.payments[0];
        return (
          <div className="text-xs">
            <p className="text-sm">{formatCurrency(j.totals.deposit_amount + j.totals.onboarding_charge)}</p>
            <p className="text-muted-foreground">
              {formatCurrency(j.totals.deposit_amount)} deposit
              {j.totals.onboarding_charge > 0 ? ` + ${formatCurrency(j.totals.onboarding_charge)} onboarding` : ""}
            </p>
            {first ? (
              <p className="text-muted-foreground">
                {formatFullDateTime(first.captured_at)}{first.method ? ` · ${first.method.toUpperCase()}` : ""}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      header: "Rental",
      key: "rental",
      hideOnMobile: true,
      render: (j) => {
        const r = j.rentals[0];
        return r ? (
          <div className="text-xs">
            <p>{formatFullDateTime(r.picked_up_at)}</p>
            <p className="text-muted-foreground">
              {r.returned_at ? `returned ${formatFullDateTime(r.returned_at)}` : "still riding"}
            </p>
          </div>
        ) : <span className="text-xs text-muted-foreground">Not picked up</span>;
      },
    },
    { header: "Deposit", key: "status", render: (j) => <StatusBadge status={j.deposit.status} /> },
    {
      header: "Refund",
      key: "refund",
      render: (j) => {
        const latest = j.refunds[j.refunds.length - 1];
        return latest ? (
          <div className="space-y-1">
            <StatusBadge status={latest.status} />
            <p className="text-xs text-muted-foreground">{formatCurrency(latest.amount)}</p>
          </div>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      header: "Where it stands",
      key: "headline",
      hideOnMobile: true,
      render: (j) => <span className="text-xs text-muted-foreground">{journeyHeadline(j)}</span>,
    },
  ];

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select value={status} onValueChange={(v) => { setStatus(v as DepositStatus | "all"); setPage(1); }}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Deposit status" /></SelectTrigger>
            <SelectContent>
              {DEPOSIT_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "Any deposit status" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Click a row for the full start-to-end record.</p>
        </div>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={setSelected}
          emptyTitle="No deposits match your filter"
        />
        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>
      <DepositJourneyDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        journey={selected ?? undefined}
        isLoading={false}
        isError={false}
      />
    </>
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
            {refund?.booking?.cancelled_at ? ` · cancelled ${formatFullDateTime(refund.booking.cancelled_at)}` : ""}
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
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
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
                {refund.reviewed_at ? ` on ${formatFullDateTime(refund.reviewed_at)}` : ""}
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
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
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
