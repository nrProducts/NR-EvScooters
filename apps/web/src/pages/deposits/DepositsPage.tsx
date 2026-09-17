import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { Pagination } from "@/components/common/Pagination";
import { SideDrawer } from "@/components/common/SideDrawer";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useDeposits } from "@/hooks/useDeposits";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Deposit, DepositStatus } from "@/types";

const STATUS_OPTIONS: (DepositStatus | "all")[] = ["all", "pending", "held", "released", "forfeited"];

/**
 * Deposits, and specifically WHY each one is or is not refundable yet.
 *
 * Two independent gates decide that, and a staff member looking at a rider
 * asking "where is my money" needs to see which one is closed: the rider's
 * completed rental days against the minimum their plan required, and the
 * post-return holding period. A single "not eligible" badge would send them
 * to the database to find out which.
 */
export default function DepositsPage() {
  const [status, setStatus] = useState<DepositStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Deposit | null>(null);

  const { data, isLoading, isError, refetch } = useDeposits({ status, page, pageSize: 10 });

  const columns: DataTableColumn<Deposit>[] = [
    {
      header: "Rider",
      key: "rider",
      render: (d) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{d.rider?.full_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {d.vehicle_model_name ?? d.rider?.phone ?? "—"}
          </p>
        </div>
      ),
    },
    {
      header: "Collected up front",
      key: "amount",
      render: (d) => (
        <div className="min-w-0">
          <p className="text-sm">{formatCurrency(d.amount + d.onboarding_charge_amount)}</p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(d.onboarding_charge_amount)} onboarding ·{" "}
            {formatCurrency(d.amount)} deposit
          </p>
        </div>
      ),
    },
    {
      header: "Rental days",
      key: "rental_days_completed",
      hideOnMobile: true,
      render: (d) =>
        d.min_rental_days_required > 0 ? (
          <span
            className={
              d.rental_days_completed >= d.min_rental_days_required
                ? "text-sm"
                : "text-sm text-destructive"
            }
          >
            {d.rental_days_completed} / {d.min_rental_days_required}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No minimum</span>
        ),
    },
    { header: "Status", key: "status", render: (d) => <StatusBadge status={d.status} /> },
    {
      header: "Refund",
      key: "refund_eligibility",
      render: (d) => <EligibilityLabel deposit={d} />,
    },
    {
      header: "Refundable",
      key: "refundable_amount",
      hideOnMobile: true,
      render: (d) => formatCurrency(d.refundable_amount),
    },
  ];

  usePageSubtitle(
    `${data?.total ?? 0} deposits · the onboarding charge is never refundable; the security deposit becomes refundable once the rider completes the minimum rental days their plan required`,
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <FilterBar
          filters={
            <Select
              value={status}
              onValueChange={(v) => { setStatus(v as DepositStatus | "all"); setPage(1); }}
            >
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s === "all" ? "Any status" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={setSelected}
          emptyTitle="No deposits"
          emptyDescription="Nothing matches this filter."
        />
      </Card>

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      )}

      <DepositDrawer deposit={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function EligibilityLabel({ deposit }: { deposit: Deposit }) {
  if (deposit.refund_eligibility === "refund_processed") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Refunded
      </span>
    );
  }
  if (deposit.refund_eligibility === "eligible") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> Eligible
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> Not eligible
    </span>
  );
}

/**
 * The reason, in a sentence, rather than leaving staff to infer it from four
 * fields. Order matters: a forfeited deposit is gone regardless of any other
 * condition, and the day threshold is the gate riders actually ask about.
 */
function eligibilityReason(d: Deposit): string {
  if (d.status === "forfeited") {
    return d.forfeit_reason ?? "This deposit was forfeited.";
  }
  if (d.status === "released") return "The refund for this deposit has been processed.";
  if (d.status === "pending") return "The rider's payment has not been captured yet.";

  if (d.min_rental_days_required > 0 && d.rental_days_completed < d.min_rental_days_required) {
    const remaining = d.min_rental_days_required - d.rental_days_completed;
    return (
      `${d.rental_days_completed} of the ${d.min_rental_days_required} required rental days ` +
      `completed — ${remaining} more to go before this deposit can be refunded.`
    );
  }
  if (!d.refund_eligible_at) {
    return "The rental is still running. The holding period starts when the scooter is returned.";
  }
  if (d.refund_eligibility === "not_eligible") {
    return `In the post-return holding period until ${formatDate(d.refund_eligible_at)}.`;
  }
  return "Both the rental-days minimum and the holding period are satisfied.";
}

function DepositDrawer({ deposit, onClose }: { deposit: Deposit | null; onClose: () => void }) {
  if (!deposit) return null;

  const collected = deposit.amount + deposit.onboarding_charge_amount;
  const deductions = Math.max(0, deposit.amount - deposit.refundable_amount);

  return (
    <SideDrawer open={!!deposit} onOpenChange={(o) => !o && onClose()} title="Deposit">
      <div className="space-y-4">
        <div className="space-y-1 text-sm">
          <Row label="Rider" value={deposit.rider?.full_name ?? "—"} />
          <Row label="Scooter" value={deposit.vehicle_model_name ?? "—"} />
          <Row label="Status" value={deposit.status} />
          <Row label="Taken" value={formatDate(deposit.created_at)} />
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Collected up front
          </p>
          <div className="space-y-1 text-sm">
            <Row label="Total" value={formatCurrency(collected)} />
            <Row
              label="Onboarding charge"
              value={`${formatCurrency(deposit.onboarding_charge_amount)} · non-refundable`}
            />
            <Row
              label="Security deposit"
              value={`${formatCurrency(deposit.amount)} · refundable`}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Refund position
          </p>
          <div className="space-y-1 text-sm">
            <Row
              label="Rental days completed"
              value={
                deposit.min_rental_days_required > 0
                  ? `${deposit.rental_days_completed} of ${deposit.min_rental_days_required} required`
                  : `${deposit.rental_days_completed} · no minimum on this plan`
              }
            />
            <Row label="Security deposit" value={formatCurrency(deposit.amount)} />
            <Row label="Deductions (damage)" value={`− ${formatCurrency(deductions)}`} />
            <div className="flex items-center justify-between gap-3 border-t border-border pt-1">
              <span className="text-xs font-medium">Final refundable</span>
              <span className="text-sm font-semibold">
                {formatCurrency(deposit.refundable_amount)}
              </span>
            </div>
          </div>
        </div>

        <div
          className={
            deposit.refund_eligibility === "eligible"
              ? "rounded-lg border border-success/40 bg-success/5 p-3"
              : "rounded-lg border border-border bg-muted/40 p-3"
          }
        >
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {deposit.refund_eligibility === "refund_processed"
                  ? "Refund processed"
                  : deposit.refund_eligibility === "eligible"
                    ? "Eligible for refund"
                    : "Not eligible for refund"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{eligibilityReason(deposit)}</p>
            </div>
          </div>
        </div>

        {deposit.booking_id && (
          <div className="flex flex-wrap gap-3 text-xs">
            <Link to={`/payments?bookingId=${deposit.booking_id}`} className="underline">
              Payment history
            </Link>
            <Link to={`/damages?bookingId=${deposit.booking_id}`} className="underline">
              Damage records
            </Link>
            <Link to="/refunds" className="underline">
              Refunds
            </Link>
          </div>
        )}
      </div>
    </SideDrawer>
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
