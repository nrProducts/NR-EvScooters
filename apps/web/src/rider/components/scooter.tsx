import type { ReactNode } from "react";
import {
  CheckCircle2, Clock, AlertTriangle, CreditCard, RefreshCw, Undo2, PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/common/Spinner";
import { computeLateReturnPenalty, getRenewalEligibility } from "../lib/returnPolicy";
import { formatMoney } from "../constants/status";
import { usePaySettlement } from "../hooks/mutations";
import type { ApiRental, ApiReturnSettlement, ApiReturnStage } from "../types/api";

type Tone = "danger" | "warning" | "success" | "primary";
const TONE_CLASS: Record<Tone, string> = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  primary: "border-primary/30 bg-primary/10 text-primary",
};

function StatusShell({
  tone, icon: Icon, title, children,
}: { tone: Tone; icon: typeof Clock; title: string; children: ReactNode }) {
  return (
    <div className={cn("mb-5 rounded-lg border p-4", TONE_CLASS[tone])}>
      <div className="mb-1.5 flex items-center gap-2 text-xs font-bold">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

/**
 * The one status card Home / My Scooter shows about the rider's current
 * scooter — ported from apps/mobile ScooterStatusCard, same priority order.
 */
export function ScooterStatusCard({
  rental, settlement, stage, onRenew,
}: {
  rental: ApiRental;
  settlement: ApiReturnSettlement | null;
  stage: ApiReturnStage | null;
  onRenew: () => void;
}) {
  const { pay, paying, error } = usePaySettlement(settlement);
  const isSettlementDue = !!settlement && settlement.due_amount > 0 && settlement.status === "amount_due";
  const charge = computeLateReturnPenalty({
    returnDueAt: rental.return_due_at,
    maxDays: rental.max_late_fee_days,
    feePerDay: rental.late_return_fee_per_day,
  });
  const eligibility = getRenewalEligibility(rental.plan_status, rental.next_due_at, rental.renewal_status);

  if (isSettlementDue) {
    return (
      <StatusShell tone="danger" icon={CreditCard} title="Payment Required">
        <p className="mt-1 text-2xl font-bold">{formatMoney(settlement!.due_amount)}</p>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Complete the payment to finish your scooter return.
        </p>
        <Button variant="destructive" className="w-full" onClick={pay} disabled={paying}>
          {paying ? <Spinner className="h-4 w-4" /> : `Pay ${formatMoney(settlement!.due_amount)}`}
        </Button>
        {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
      </StatusShell>
    );
  }
  if (stage?.status === "payment_submitted") {
    return (
      <StatusShell tone="warning" icon={Clock} title="Payment Received">
        <p className="text-xs text-muted-foreground">Awaiting admin confirmation before your return can be completed.</p>
      </StatusShell>
    );
  }
  if (stage?.status === "ready_for_approval") {
    return (
      <StatusShell tone="warning" icon={Clock} title="Return Verification Pending">
        <p className="text-xs text-muted-foreground">Your payment is verified — our team is completing the handover.</p>
      </StatusShell>
    );
  }
  if (rental.return_requested_at) {
    return (
      <StatusShell tone="warning" icon={Undo2} title="Return Requested">
        <p className="text-xs text-muted-foreground">Your scooter is waiting for staff confirmation. It stays yours until then.</p>
      </StatusShell>
    );
  }
  if (rental.recovery_flagged_at) {
    return (
      <StatusShell tone="danger" icon={AlertTriangle} title="Vehicle Recovery Required">
        <p className="text-xs text-muted-foreground">
          A {formatMoney(charge.penaltyAmount)} late fee applies. Please make your scooter available for pickup.
        </p>
      </StatusShell>
    );
  }
  if (charge.isLate) {
    return (
      <StatusShell tone="danger" icon={AlertTriangle} title={`Overdue by ${charge.daysLate} day${charge.daysLate > 1 ? "s" : ""}`}>
        <p className="text-xs text-muted-foreground">
          A {formatMoney(charge.penaltyAmount)} late fee has built up — return your scooter as soon as possible.
        </p>
      </StatusShell>
    );
  }
  if (rental.renewal_status === "scheduled") {
    return (
      <StatusShell tone="success" icon={RefreshCw} title="Renewal Scheduled">
        <p className="text-xs text-muted-foreground">Your current plan stays active until the new period starts.</p>
      </StatusShell>
    );
  }
  if (eligibility.canRenew) {
    return (
      <StatusShell tone={eligibility.isLate ? "danger" : "primary"} icon={RefreshCw} title={eligibility.isLate ? "Plan Expired" : "Plan ending soon"}>
        <p className="mb-3 text-xs text-muted-foreground">
          {eligibility.isLate ? "Renew now — a late fee applies, shown before you pay." : "Renew any time before your plan ends."}
        </p>
        <Button className="w-full" onClick={onRenew}>Renew Plan</Button>
      </StatusShell>
    );
  }
  return (
    <StatusShell tone="success" icon={CheckCircle2} title="Scooter Active">
      <p className="text-xs text-muted-foreground">Everything looks good.</p>
    </StatusShell>
  );
}

/** Post-return settlement summary — ported from apps/mobile SettlementCard. */
export function SettlementCard({ settlement }: { settlement: ApiReturnSettlement }) {
  const { pay, paying, error } = usePaySettlement(settlement);
  const isDue = settlement.due_amount > 0 && settlement.status === "amount_due";

  if (isDue) {
    return (
      <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold text-destructive">
          <PackageCheck className="h-4 w-4" /> Scooter Return Settlement
        </div>
        <p className="mt-2 text-2xl font-bold">{formatMoney(settlement.due_amount)}</p>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Additional amount due — please pay this to complete your return.
        </p>
        <Button variant="destructive" className="w-full" onClick={pay} disabled={paying}>
          {paying ? <Spinner className="h-4 w-4" /> : `Pay ${formatMoney(settlement.due_amount)}`}
        </Button>
        {error && <p className="mt-2 text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  const line = (label: string, amount: number) => (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium", amount < 0 && "text-destructive")}>
        {amount < 0 ? "-" : ""}
        {formatMoney(Math.abs(amount))}
      </span>
    </div>
  );

  return (
    <div className="mb-4 rounded-lg border border-success/40 bg-success/10 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold text-success">
        <CheckCircle2 className="h-4 w-4" /> Scooter Returned Successfully
      </div>
      {line("Security Deposit", settlement.deposit_amount)}
      {settlement.late_fee_amount > 0 && line("Late Fee", -settlement.late_fee_amount)}
      {settlement.damage_fee_amount > 0 && line("Damage Fee", -settlement.damage_fee_amount)}
      {settlement.other_charges.map((c, i) => (
        <div key={i}>{line(c.label, -c.amount)}</div>
      ))}
      {settlement.refund_amount > 0 && (
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-bold">
          <span>Refund Amount</span>
          <span className="text-success">{formatMoney(settlement.refund_amount)}</span>
        </div>
      )}
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Refund status: {settlement.status.replace(/_/g, " ")}
      </p>
    </div>
  );
}

export function shouldShowSettlement(s: ApiReturnSettlement | null): boolean {
  if (!s) return false;
  const terminal = s.status === "refund_completed" || s.status === "settlement_completed" || s.status === "no_refund_required";
  if (!terminal) return true;
  const resolvedAt = s.processed_at ? new Date(s.processed_at).getTime() : 0;
  return Date.now() - resolvedAt < 48 * 60 * 60 * 1000;
}
