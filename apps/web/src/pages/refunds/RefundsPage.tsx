import { useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useRefunds, useRefundSettlement, useRetryRefund } from "@/hooks/useRefunds";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";
import type { Refund, RefundStatus, RefundType } from "@/types";

const STATUS_OPTIONS: (RefundStatus | "all")[] = ["all", "pending", "processing", "succeeded", "failed"];
const REFUND_TYPE_OPTIONS: (RefundType | "all")[] = [
  "all", "deposit_release", "booking_cancellation", "settlement", "goodwill",
];
const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  deposit_release: "Deposit Release",
  booking_cancellation: "Booking Cancellation",
  settlement: "Return Settlement",
  // New: a discretionary refund had no expression at all before, so one was
  // recorded as whichever of the other two fitted least badly.
  goodwill: "Goodwill",
};

export default function RefundsPage() {
  const [status, setStatus] = useState<RefundStatus | "all">("all");
  const [refundType, setRefundType] = useState<RefundType | "all">("all");
  const [page, setPage] = useState(1);
  const [approveTarget, setApproveTarget] = useState<Refund | null>(null);
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
      header: "Booking",
      key: "booking_id",
      render: (r) => (
        <Link
          to={`/payments?bookingId=${r.booking_id}`}
          className="text-sm underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.booking_id.slice(0, 8)}…
        </Link>
      ),
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
    { header: "Amount", key: "amount", sortKey: "amount", render: (r) => formatCurrency(r.amount) },
    {
      header: "Cancellation fee",
      key: "cancellation_penalty_amount",
      render: (r) => (r.booking?.cancellation_penalty_amount != null ? formatCurrency(r.booking.cancellation_penalty_amount) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Cancelled",
      key: "cancelled_at",
      render: (r) => (r.booking?.cancelled_at ? formatDate(r.booking.cancelled_at) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Cancellation reason",
      key: "cancellation_reason",
      render: (r) => <span className="text-xs text-muted-foreground">{r.booking?.cancellation_reason ?? "—"}</span>,
      hideOnMobile: true,
    },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    { header: "Attempts", key: "attempt_count", render: (r) => r.attempt_count, hideOnMobile: true },
    { header: "Initiated", key: "initiated_at", sortKey: "created_at", render: (r) => formatDate(r.initiated_at) },
    { header: "Completed", key: "processed_at", render: (r) => (r.processed_at ? formatDate(r.processed_at) : "—"), hideOnMobile: true },
    {
      header: "Transaction ID",
      key: "gateway_refund_id",
      render: (r) => <span className="font-mono text-xs">{r.gateway_refund_id ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      header: "Failure reason",
      key: "failure_reason",
      render: (r) => <span className="text-xs text-destructive">{r.failure_reason ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      header: "Actions",
      key: "actions",
      render: (r) => {
        if (r.status === "pending") {
          return (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setApproveTarget(r);
              }}
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
            </Button>
          );
        }
        if (r.status === "failed") {
          return (
            <Button
              variant="outline"
              size="sm"
              disabled={retry.isPending}
              onClick={(e) => {
                e.stopPropagation();
                retry.mutate(r.id);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
          );
        }
        return <span className="text-xs text-muted-foreground">—</span>;
      },
    },
  ];

  usePageSubtitle(`${data?.total ?? 0} refunds — security deposits and cancelled bookings`);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/returns">Returns &amp; Settlements</Link>
        </Button>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={refundType}
            onValueChange={(v) => {
              setRefundType(v as RefundType | "all");
              setPage(1);
            }}
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
            onValueChange={(v) => {
              setStatus(v as RefundStatus | "all");
              setPage(1);
            }}
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

      <ApproveRefundDialog refund={approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)} />
    </div>
  );
}

function ApproveRefundDialog({
  refund,
  onOpenChange,
}: {
  refund: Refund | null;
  onOpenChange: (open: boolean) => void;
}) {
  const retry = useRetryRefund();
  const isDeposit = refund?.refund_type === "deposit_release";
  const settlement = useRefundSettlement(isDeposit ? refund?.id : undefined);

  return (
    <Dialog open={!!refund} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve refund of {refund ? formatCurrency(refund.amount) : ""}?</DialogTitle>
          {!isDeposit && (
            <DialogDescription>
              {refund?.booking?.rider_name ?? "This rider"} — booking cancelled
              {refund?.booking?.cancelled_at ? ` on ${formatDate(refund.booking.cancelled_at)}` : ""}
              {refund?.booking?.cancellation_reason ? `: ${refund.booking.cancellation_reason}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>

        {isDeposit ? (
          settlement.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading settlement…</p>
          ) : settlement.data ? (
            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <Row label="Security deposit" value={formatCurrency(settlement.data.depositAmount)} />
              {settlement.data.lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">No damage recorded — full deposit refundable.</p>
              ) : (
                settlement.data.lines.map((line) => (
                  <Row
                    key={line.id}
                    label={line.description}
                    value={`-${formatCurrency(line.deposit_deduction)}`}
                    muted
                  />
                ))
              )}
              <div className="h-px bg-border" />
              <Row label="Total deduction" value={formatCurrency(settlement.data.totalDeduction)} />
              <Row label="Net Refund" value={formatCurrency(settlement.data.netRefund)} strong />
              {settlement.data.additionalAmountDue > 0 && (
                <p className="rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
                  Additional Amount Due: {formatCurrency(settlement.data.additionalAmountDue)} — deductions exceeded
                  the deposit; billed separately.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-destructive">Couldn&apos;t load the settlement breakdown.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            This sends {refund ? formatCurrency(refund.amount) : "the refund"} to the rider&apos;s original payment
            method via Razorpay right away. This can&apos;t be undone.
          </p>
        )}

        {retry.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {retry.error instanceof ApiError ? retry.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter className="sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {isDeposit && refund && (
              <Button variant="outline" asChild>
                <Link to={`/damages?bookingId=${refund.booking_id}`} onClick={() => onOpenChange(false)}>
                  Edit Charges
                </Link>
              </Button>
            )}
          </div>
          <Button
            disabled={retry.isPending}
            onClick={() => {
              if (refund) {
                retry.mutate(refund.id, { onSuccess: () => onOpenChange(false) });
              }
            }}
          >
            {retry.isPending ? "Approving..." : "Approve & Process Refund"}
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
