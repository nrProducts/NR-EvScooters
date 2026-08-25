import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Plus, ShieldCheck, Trash2, Wrench, XCircle, Clock, CreditCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import {
  useReturnDetail, useSaveInspection, usePaymentReview, useVerifyReturnPayment, useApproveReturnSettlement,
} from "@/hooks/useReturns";
import { useMoveRideToMaintenance, useRejectReturn } from "@/hooks/useRentals";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import type { ReturnStageStatus } from "@/types";

interface DamageItemForm {
  amount: string;
  description: string;
}

interface OtherChargeForm {
  label: string;
  amount: string;
}

/**
 * Vehicle Return → Inspection → Payment Gate → Approve Return.
 *
 * `stage.status` (computed server-side, see returns.types.ts's ReturnStage)
 * drives which of four panels renders — the inspection form, "payment
 * required" (waiting on the rider), "review payment" (waiting on staff to
 * verify), or the vehicle-outcome/Approve Return step. Only the backend's
 * settleReturn gate is the real enforcement (a return with money owed and
 * not yet verified is rejected outright, not just hidden) — this page just
 * makes the same rule visible before a click is wasted on it.
 */
const STAGE_LABEL: Record<ReturnStageStatus, string> = {
  return_requested: "Return Requested",
  payment_required: "Payment Required",
  payment_submitted: "Payment Submitted",
  ready_for_approval: "Ready for Approval",
  return_completed: "Return Completed",
  rejected: "Rejected",
};

export default function ReturnDetailPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useReturnDetail(rentalId);
  const saveInspection = useSaveInspection();
  const approveSettlement = useApproveReturnSettlement();
  const moveToMaintenance = useMoveRideToMaintenance();
  const rejectReturn = useRejectReturn();

  const [damageItems, setDamageItems] = useState<DamageItemForm[]>([]);
  const [inspectedClean, setInspectedClean] = useState(false);
  const [otherCharges, setOtherCharges] = useState<OtherChargeForm[]>([]);
  const [outcome, setOutcome] = useState<"available" | "maintenance">("available");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewingPayment, setReviewingPayment] = useState(false);

  const paymentReview = usePaymentReview(rentalId, reviewingPayment);
  const verifyPayment = useVerifyReturnPayment();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError || !data) return <ErrorState message="Return not found." onRetry={() => refetch()} />;

  const { rental, deposit, stage } = data;
  const settlement = data.settlement;
  const alreadySettled = rental.status === "completed";
  const stageStatus: ReturnStageStatus = alreadySettled
    ? "return_completed"
    : stage?.status ?? "return_requested";

  const itemValid = (item: DamageItemForm) => Number(item.amount) > 0 && item.description.trim().length >= 3;
  const hasDamageItems = damageItems.length > 0;
  const damageValid = hasDamageItems ? damageItems.every(itemValid) : true;
  const hasInspection = inspectedClean || (hasDamageItems && damageItems.every(itemValid));

  const otherChargeValid = (c: OtherChargeForm) => c.label.trim().length >= 2 && Number(c.amount) > 0;
  const otherChargesValid = otherCharges.every(otherChargeValid);

  // Live preview — mirrors saveInspection's exact formula so the button
  // label (Approve Return vs Request Payment from Rider) is right BEFORE
  // the click, not just after. No late fee here: it's already collected
  // upfront in the rider app (Overdue Rider → Late Fee Payment → Return
  // gate), not charged again at inspection.
  const previewDamageFee = damageItems.filter(itemValid).reduce((sum, i) => sum + Number(i.amount), 0);
  const previewOtherCharges = otherCharges.filter(otherChargeValid).reduce((sum, c) => sum + Number(c.amount), 0);
  const depositAmount = deposit?.amount ?? 0;
  const previewTotalCharges = previewDamageFee + previewOtherCharges;
  const previewNet = depositAmount - previewTotalCharges;
  const previewRefund = Math.max(0, previewNet);
  const previewDue = Math.max(0, -previewNet);

  const addDamageItem = () => {
    setInspectedClean(false);
    setDamageItems((items) => [...items, { amount: "", description: "" }]);
  };
  const removeDamageItem = (index: number) => setDamageItems((items) => items.filter((_, i) => i !== index));
  const updateDamageItem = (index: number, patch: Partial<DamageItemForm>) =>
    setDamageItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const addOtherCharge = () => setOtherCharges((items) => [...items, { label: "", amount: "" }]);
  const removeOtherCharge = (index: number) => setOtherCharges((items) => items.filter((_, i) => i !== index));
  const updateOtherCharge = (index: number, patch: Partial<OtherChargeForm>) =>
    setOtherCharges((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const handleSaveInspection = () => {
    if (!rentalId) return;
    setFormError(null);
    saveInspection.mutate(
      {
        rentalId,
        input: {
          damageItems: damageItems.filter(itemValid).map((i) => ({
            amount: Number(i.amount), description: i.description.trim(), photoPaths: [],
          })),
          otherCharges: otherCharges.filter(otherChargeValid).map((c) => ({ label: c.label.trim(), amount: Number(c.amount) })),
        },
      },
      {
        onSuccess: (result) => {
          toastSuccess(
            result.stage && result.stage.additionalDue > 0
              ? "Inspection saved — payment requested from rider"
              : "Inspection saved",
          );
        },
        onError: (err) => {
          setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
          toastError(err, "Could not save inspection");
        },
      },
    );
  };

  const handleVerifyPayment = () => {
    if (!rentalId) return;
    verifyPayment.mutate(rentalId, {
      onSuccess: () => toastSuccess("Payment verified — return ready for approval"),
      onError: (err) => toastError(err, "Could not verify payment"),
    });
  };

  const handleApprove = () => {
    if (!rentalId) return;
    setFormError(null);

    if (outcome === "maintenance") {
      if (maintenanceNotes.trim().length < 3) {
        setFormError("Describe why this vehicle needs maintenance (at least 3 characters).");
        return;
      }
      moveToMaintenance.mutate(
        { id: rentalId, input: { description: maintenanceNotes.trim(), inspected: true } },
        {
          onSuccess: () => toastSuccess("Return approved — vehicle sent to maintenance"),
          onError: (err) => {
            setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
            toastError(err, "Could not approve return");
          },
        },
      );
      return;
    }

    approveSettlement.mutate(
      { rentalId, input: {} },
      {
        onSuccess: () => toastSuccess("Return approved and settled"),
        onError: (err) => {
          setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
          toastError(err, "Could not settle return");
        },
      },
    );
  };

  const handleReject = () => {
    if (!rentalId) return;
    rejectReturn.mutate(
      { id: rentalId, input: { reason: rejectReason.trim() } },
      {
        onSuccess: () => {
          toastSuccess("Return rejected");
          navigate("/returns");
        },
        onError: (err) => toastError(err, "Could not reject return"),
      },
    );
  };

  const isPending = saveInspection.isPending || approveSettlement.isPending || moveToMaintenance.isPending
    || rejectReturn.isPending || verifyPayment.isPending;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/returns")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {rental.rider?.full_name ?? "Rider"} — {rental.vehicle?.registration_number ?? "Vehicle"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Rental started {formatDateTime(rental.started_at)}
            {rental.return_requested_at ? ` · Return requested ${formatDateTime(rental.return_requested_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6875rem] text-muted-foreground">Return Status:</span>
            <StageBadge status={stageStatus} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6875rem] text-muted-foreground">Financial Settlement:</span>
            {alreadySettled
              ? <StatusBadge status={settlement?.status ?? "pending_refund"} />
              : <span className="text-xs font-medium">{financialSettlementLabel(stageStatus, stage?.additionalDue ?? 0)}</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left — Charges (the inspection form itself, only while it hasn't been saved yet) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Charges / Adjustments</CardTitle>
            <CardDescription>Everything that affects this rider&apos;s deposit/refund.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Security Deposit</span>
              </div>
              <span className="font-semibold">{formatCurrency(depositAmount)}</span>
            </div>

            {stageStatus !== "return_requested" ? (
              <div className="space-y-1.5 text-sm">
                {(alreadySettled ? settlement?.damage_fee_amount : stage?.damageAmount ?? 0)! > 0 && (
                  <SettledLine label="Damage Fee" amount={(alreadySettled ? settlement?.damage_fee_amount : stage?.damageAmount) ?? 0} />
                )}
                {alreadySettled
                  ? settlement?.other_charges.map((c, i) => <SettledLine key={i} label={c.label} amount={c.amount} />)
                  : (stage?.otherChargesAmount ?? 0) > 0 && <SettledLine label="Other charges" amount={stage!.otherChargesAmount} />}
              </div>
            ) : (
              <>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <Label className="text-xs font-semibold">Vehicle inspection</Label>
                  {damageItems.map((item, index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Damage item {index + 1}</span>
                        <button type="button" onClick={() => removeDamageItem(index)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Input
                        type="number" min={0} value={item.amount} placeholder="Amount (₹)"
                        onChange={(e) => updateDamageItem(index, { amount: e.target.value })}
                      />
                      <Textarea
                        value={item.description} rows={2}
                        placeholder="Describe the damage (at least 3 characters)"
                        onChange={(e) => updateDamageItem(index, { description: e.target.value })}
                      />
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addDamageItem}>
                    <Plus className="h-3.5 w-3.5" /> Add damage item
                  </Button>
                  {!hasDamageItems && (
                    <label className="flex items-center gap-2 pt-1 text-xs">
                      <input
                        type="checkbox" className="h-3.5 w-3.5 accent-primary"
                        checked={inspectedClean} onChange={(e) => setInspectedClean(e.target.checked)}
                      />
                      I have physically inspected this vehicle — no damage found
                    </label>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border border-border p-3">
                  <Label className="text-xs font-semibold">Other charges</Label>
                  {otherCharges.map((c, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={c.label} placeholder="Label" className="flex-1"
                        onChange={(e) => updateOtherCharge(index, { label: e.target.value })}
                      />
                      <Input
                        type="number" min={0} value={c.amount} placeholder="₹" className="w-28"
                        onChange={(e) => updateOtherCharge(index, { amount: e.target.value })}
                      />
                      <button type="button" onClick={() => removeOtherCharge(index)} className="text-muted-foreground hover:text-destructive" aria-label="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addOtherCharge}>
                    <Plus className="h-3.5 w-3.5" /> Add charge
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right — Settlement + stage-specific action */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Final Settlement</CardTitle>
            <CardDescription>Updates live as charges are added, edited, or removed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alreadySettled && settlement ? (
              <SettlementSummary
                depositAmount={settlement.deposit_amount}
                totalCharges={settlement.total_charges}
                refund={settlement.refund_amount}
                due={settlement.due_amount}
              />
            ) : stageStatus === "return_requested" ? (
              <SettlementSummary
                depositAmount={depositAmount}
                totalCharges={previewTotalCharges}
                refund={previewRefund}
                due={previewDue}
              />
            ) : (
              <SettlementSummary
                depositAmount={stage!.depositAmount}
                totalCharges={stage!.totalCharges}
                refund={stage!.refundDue}
                due={stage!.additionalDue}
              />
            )}

            {!alreadySettled && stageStatus === "return_requested" && (
              <>
                <Button
                  className="w-full"
                  disabled={isPending || !damageValid || !hasInspection || !otherChargesValid}
                  onClick={handleSaveInspection}
                >
                  {previewDue > 0 ? "Request Payment from Rider" : "Approve Return"}
                </Button>

                <div className="space-y-2 border-t border-border pt-3">
                  <Label className="text-xs font-semibold">Reject return — reason</Label>
                  <Textarea
                    value={rejectReason} rows={2}
                    placeholder="e.g. Vehicle still due for the current billing period"
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <Button
                    variant="outline" className="w-full text-destructive hover:text-destructive"
                    disabled={isPending || rejectReason.trim().length < 3}
                    onClick={handleReject}
                  >
                    <XCircle className="h-4 w-4" /> Reject Return
                  </Button>
                </div>
              </>
            )}

            {!alreadySettled && stageStatus === "payment_required" && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-semibold">Waiting on the rider</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  The rider has been notified. This page updates once they pay — no action needed here yet.
                </p>
              </div>
            )}

            {!alreadySettled && stageStatus === "payment_submitted" && (
              <>
                <Button className="w-full" onClick={() => setReviewingPayment(true)}>
                  <CreditCard className="h-4 w-4" /> Review Payment
                </Button>
                {reviewingPayment && (
                  <PaymentReviewPanel
                    review={paymentReview.data}
                    isLoading={paymentReview.isLoading}
                    onVerify={handleVerifyPayment}
                    verifying={verifyPayment.isPending}
                  />
                )}
              </>
            )}

            {!alreadySettled && stageStatus === "ready_for_approval" && (
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-semibold">Approve return — vehicle goes to</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button" onClick={() => setOutcome("available")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm",
                      outcome === "available" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                    )}
                  >
                    <CheckCircle2 className="h-5 w-5" /> Available
                  </button>
                  <button
                    type="button" onClick={() => setOutcome("maintenance")}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm",
                      outcome === "maintenance" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                    )}
                  >
                    <Wrench className="h-5 w-5" /> Maintenance
                  </button>
                </div>
                {outcome === "maintenance" && (
                  <Textarea
                    value={maintenanceNotes} rows={2}
                    placeholder="e.g. Front brake noise reported by rider"
                    onChange={(e) => setMaintenanceNotes(e.target.value)}
                  />
                )}
                <Button
                  className="w-full"
                  disabled={isPending || (outcome === "maintenance" && maintenanceNotes.trim().length < 3)}
                  onClick={handleApprove}
                >
                  Approve Return
                </Button>
              </div>
            )}

            {formError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{formError}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function financialSettlementLabel(status: ReturnStageStatus, additionalDue: number): string {
  switch (status) {
    case "payment_required": return `${formatCurrency(additionalDue)} Due`;
    case "payment_submitted": return "Payment Review Required";
    case "ready_for_approval": return additionalDue > 0 ? "Payment Verified" : "No Amount Due";
    default: return "—";
  }
}

function StageBadge({ status }: { status: ReturnStageStatus }) {
  const tone: Record<ReturnStageStatus, string> = {
    return_requested: "bg-muted text-muted-foreground",
    payment_required: "bg-destructive/10 text-destructive",
    payment_submitted: "bg-warning/10 text-warning",
    ready_for_approval: "bg-success/10 text-success",
    return_completed: "bg-success/10 text-success",
    rejected: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold", tone[status])}>
      {STAGE_LABEL[status]}
    </span>
  );
}

function PaymentReviewPanel({
  review, isLoading, onVerify, verifying,
}: {
  review: import("@/types").PaymentReviewView | undefined;
  isLoading: boolean;
  onVerify: () => void;
  verifying: boolean;
}) {
  if (isLoading || !review) {
    return <Skeleton className="h-32 w-full" />;
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Amount</span>
        <span className="font-semibold">{formatCurrency(review.amount)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Reference</span>
        <span className="font-mono text-xs">{review.reference ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Paid at</span>
        <span>{review.paidAt ? formatDateTime(review.paidAt) : "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Status</span>
        <span className="font-semibold capitalize">{review.status}</span>
      </div>
      {review.status === "paid" && (
        <Button className="w-full" onClick={onVerify} disabled={verifying}>
          {verifying ? "Verifying..." : "Verify Payment"}
        </Button>
      )}
      {review.status === "unpaid" && (
        <p className="text-xs text-destructive">
          This payment has not been captured yet. The rider can retry payment from the app.
        </p>
      )}
    </div>
  );
}

function SettledLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-destructive">-{formatCurrency(amount)}</span>
    </div>
  );
}

function SettlementSummary({
  depositAmount, totalCharges, refund, due,
}: {
  depositAmount: number;
  totalCharges: number;
  refund: number;
  due: number;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Security Deposit</span>
        <span className="font-medium">{formatCurrency(depositAmount)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Total Charges</span>
        <span className="font-medium text-destructive">-{formatCurrency(totalCharges)}</span>
      </div>
      <div className="h-px my-1.5 bg-border" />
      {due > 0 ? (
        <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-2">
          <span className="text-sm font-bold text-destructive">Amount Due from Rider</span>
          <span className="text-lg font-black text-destructive">{formatCurrency(due)}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-success/10 p-2">
          <span className="text-sm font-bold text-success">
            {refund > 0 ? "Refund to Rider" : "Settlement"}
          </span>
          <span className="text-lg font-black text-success">
            {refund > 0 ? formatCurrency(refund) : "Fully Adjusted"}
          </span>
        </div>
      )}
    </div>
  );
}
