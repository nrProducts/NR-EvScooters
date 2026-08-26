import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Plus, ShieldCheck, Wrench, XCircle, Clock, CreditCard, CircleCheck, Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
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
import { ReturnStageStepper } from "./ReturnStageStepper";
import { DamageChargeCard } from "./DamageChargeCard";
import { AddDamageChargeModal } from "./AddDamageChargeModal";
import type { Damage, PaymentReviewView, ReturnStageStatus } from "@/types";

interface OtherChargeForm {
  label: string;
  amount: string;
}

/**
 * Vehicle Return → Inspection → Payment Gate → Approve Return.
 *
 * `stage.status` (computed server-side, see returns.types.ts's ReturnStage)
 * drives most of what's on screen. Only the backend's settleReturn gate is
 * the real enforcement (a return with money owed and not yet verified is
 * rejected outright, not just hidden) — this page just makes the same rule
 * visible before a click is wasted on it.
 */
export default function ReturnDetailPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useReturnDetail(rentalId);
  const saveInspection = useSaveInspection();
  const approveSettlement = useApproveReturnSettlement();
  const moveToMaintenance = useMoveRideToMaintenance();
  const rejectReturn = useRejectReturn();
  const verifyPayment = useVerifyReturnPayment();

  const [confirmNoDamage, setConfirmNoDamage] = useState(false);
  const [otherCharges, setOtherCharges] = useState<OtherChargeForm[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [addDamageOpen, setAddDamageOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [outcome, setOutcome] = useState<"available" | "maintenance">("available");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");

  const { rental, deposit, stage, damages } = data ?? {};
  const settlement = data?.settlement;
  const alreadySettled = rental?.status === "completed";
  const stageStatus: ReturnStageStatus = alreadySettled
    ? "return_completed"
    : stage?.status ?? "return_requested";

  const paymentReview = usePaymentReview(
    rentalId,
    stageStatus === "payment_submitted" || stageStatus === "ready_for_approval",
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError || !data || !rental) return <ErrorState message="Return not found." onRetry={() => refetch()} />;

  const hasDamage = (damages ?? []).some((d) => d.status !== "waived");
  const otherChargeValid = (c: OtherChargeForm) => c.label.trim().length >= 2 && Number(c.amount) > 0;
  const otherChargesValid = otherCharges.every(otherChargeValid);
  const canSaveInspection = hasDamage || confirmNoDamage;

  const depositAmount = deposit?.amount ?? 0;
  const previewOtherCharges = otherCharges.filter(otherChargeValid).reduce((sum, c) => sum + Number(c.amount), 0);
  const previewDamageAmount = stage?.damageAmount ?? 0;
  const previewTotalCharges = previewDamageAmount + previewOtherCharges;
  const previewDue = Math.max(0, previewTotalCharges - depositAmount);

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
          otherCharges: otherCharges.filter(otherChargeValid).map((c) => ({ label: c.label.trim(), amount: Number(c.amount) })),
          confirmNoDamage,
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

  const handleConfirmPayment = () => {
    if (!rentalId) return;
    verifyPayment.mutate(rentalId, {
      onSuccess: () => toastSuccess("Payment confirmed — return ready to complete"),
      onError: (err) => toastError(err, "Could not confirm payment"),
    });
  };

  const handleCompleteReturn = () => {
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
          onSuccess: () => { toastSuccess("Return completed — vehicle sent to maintenance"); setCompleteDialogOpen(false); },
          onError: (err) => {
            setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
            toastError(err, "Could not complete return");
          },
        },
      );
      return;
    }

    approveSettlement.mutate(
      { rentalId, input: {} },
      {
        onSuccess: () => { toastSuccess("Return completed"); setCompleteDialogOpen(false); },
        onError: (err) => {
          setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
          toastError(err, "Could not complete return");
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
      <div className="space-y-3">
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
          <StatusBadge status={stageStatus} />
        </div>

        {stageStatus !== "rejected" && (
          <Card>
            <CardContent className="p-3.5">
              <ReturnStageStepper status={stageStatus} />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left — Vehicle Inspection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle Inspection</CardTitle>
            <CardDescription>Damage charges and inspection notes for this return.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="text-[0.6875rem] text-muted-foreground">Vehicle</p>
                <p className="font-medium">{rental.vehicle?.registration_number ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{rental.vehicle?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[0.6875rem] text-muted-foreground">Battery</p>
                <p className="font-medium">
                  {rental.vehicle?.battery_percentage != null ? `${rental.vehicle.battery_percentage}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[0.6875rem] text-muted-foreground">Inspected</p>
                <p className="font-medium">
                  {rental.inspected_at ? formatDateTime(rental.inspected_at) : "Not yet"}
                </p>
              </div>
              <div>
                <p className="text-[0.6875rem] text-muted-foreground">Inspected By</p>
                <p className="font-medium">{rental.inspected_by?.full_name ?? "—"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Damage Charges</Label>
                {stageStatus === "return_requested" && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAddDamageOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add Damage Charge
                  </Button>
                )}
              </div>
              {(damages ?? []).filter((d) => d.status !== "waived").length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No damage charges recorded.
                </p>
              ) : (
                (damages ?? [])
                  .filter((d) => d.status !== "waived")
                  .map((d) => (
                    <DamageChargeCard
                      key={d.id} rentalId={rentalId!} damage={d}
                      canRemove={stageStatus === "return_requested"}
                    />
                  ))
              )}
            </div>

            {stageStatus === "return_requested" && (
              <>
                {!hasDamage && (
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox" className="h-3.5 w-3.5 accent-primary"
                      checked={confirmNoDamage} onChange={(e) => setConfirmNoDamage(e.target.checked)}
                    />
                    I have physically inspected this vehicle — no damage found
                  </label>
                )}

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
                      <button
                        type="button" onClick={() => removeOtherCharge(index)}
                        className="text-muted-foreground hover:text-destructive" aria-label="Remove"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addOtherCharge}>
                    <Plus className="h-3.5 w-3.5" /> Add charge
                  </Button>
                </div>

                <Button
                  className="w-full"
                  disabled={isPending || !canSaveInspection || !otherChargesValid}
                  onClick={handleSaveInspection}
                >
                  {previewDue > 0 ? "Save Inspection — Request Payment from Rider" : "Save Inspection"}
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
          </CardContent>
        </Card>

        {/* Right — Financial Settlement + Payment Status + Next Action */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial Settlement</CardTitle>
              <CardDescription>Updates live as charges are added, edited, or removed.</CardDescription>
            </CardHeader>
            <CardContent>
              {alreadySettled && settlement ? (
                <SettlementBreakdown
                  depositAmount={settlement.deposit_amount}
                  lateFee={settlement.late_fee_amount}
                  damageFee={settlement.damage_fee_amount}
                  otherCharges={settlement.other_charges_amount}
                  totalCharges={settlement.total_charges}
                  refund={settlement.refund_amount}
                  due={settlement.due_amount}
                />
              ) : stageStatus === "return_requested" ? (
                <SettlementBreakdown
                  depositAmount={depositAmount}
                  lateFee={0}
                  damageFee={previewDamageAmount}
                  otherCharges={previewOtherCharges}
                  totalCharges={previewTotalCharges}
                  refund={Math.max(0, depositAmount - previewTotalCharges)}
                  due={previewDue}
                />
              ) : (
                <SettlementBreakdown
                  depositAmount={stage!.depositAmount}
                  lateFee={0}
                  damageFee={stage!.damageAmount}
                  otherCharges={stage!.otherChargesAmount}
                  totalCharges={stage!.totalCharges}
                  refund={stage!.refundDue}
                  due={stage!.additionalDue}
                />
              )}
            </CardContent>
          </Card>

          {!alreadySettled && (stageStatus === "payment_submitted" || stageStatus === "ready_for_approval") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentStatusPanel
                  review={paymentReview.data}
                  isLoading={paymentReview.isLoading}
                  onConfirm={handleConfirmPayment}
                  confirming={verifyPayment.isPending}
                />
              </CardContent>
            </Card>
          )}

          {/* Sticky next-action panel */}
          <div className="sticky bottom-4">
            <Card className="border-primary/30">
              <CardContent className="space-y-3 p-4">
                {alreadySettled ? (
                  <div className="flex items-center gap-2 text-success">
                    <CircleCheck className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-bold">Return Completed</p>
                      <p className="text-xs text-muted-foreground">
                        {rental.return_approved_by?.full_name
                          ? `Completed by ${rental.return_approved_by.full_name}`
                          : "This return has been fully processed."}
                      </p>
                    </div>
                  </div>
                ) : stageStatus === "return_requested" ? (
                  <p className="text-xs text-muted-foreground">
                    Finish the vehicle inspection on the left to move this return forward.
                  </p>
                ) : stageStatus === "payment_required" ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-destructive">
                      <Clock className="h-4 w-4" />
                      <p className="text-sm font-bold">Payment Required</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Additional Amount Due <span className="font-bold text-destructive">{formatCurrency(stage?.additionalDue ?? 0)}</span>.
                      The rider has been notified — this page updates once they pay.
                    </p>
                  </div>
                ) : stageStatus === "ready_for_approval" ? (
                  <>
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      <p className="text-sm font-bold">Ready to Complete</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(stage?.additionalDue ?? 0) > 0
                        ? "Payment has been verified. Return is ready to be completed."
                        : "No amount is due. Return is ready to be completed."}
                    </p>
                    <Button className="w-full" onClick={() => setCompleteDialogOpen(true)}>
                      Complete Return
                    </Button>
                  </>
                ) : null}
                {formError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{formError}</p>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Return Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ReturnActivityTimeline
            returnRequestedAt={rental.return_requested_at}
            inspectedAt={rental.inspected_at}
            damages={damages ?? []}
            paymentReview={stageStatus === "payment_submitted" || stageStatus === "ready_for_approval" ? paymentReview.data : undefined}
            returnApprovedAt={rental.return_approved_at}
          />
        </CardContent>
      </Card>

      {rentalId && (
        <AddDamageChargeModal rentalId={rentalId} open={addDamageOpen} onOpenChange={setAddDamageOpen} />
      )}

      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Vehicle Return</DialogTitle>
            <DialogDescription>What should happen to this vehicle?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button" onClick={() => setOutcome("available")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm",
                outcome === "available" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
              )}
            >
              <CheckCircle2 className="h-5 w-5" />
              Available
              <span className="text-[0.6875rem] font-normal text-muted-foreground">Ready for another rider.</span>
            </button>
            <button
              type="button" onClick={() => setOutcome("maintenance")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm",
                outcome === "maintenance" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
              )}
            >
              <Wrench className="h-5 w-5" />
              Maintenance
              <span className="text-[0.6875rem] font-normal text-muted-foreground">Needs work before rental.</span>
            </button>
          </div>
          {outcome === "maintenance" && (
            <Textarea
              value={maintenanceNotes} rows={2}
              placeholder="e.g. Front brake noise reported by rider"
              onChange={(e) => setMaintenanceNotes(e.target.value)}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={isPending || (outcome === "maintenance" && maintenanceNotes.trim().length < 3)}
              onClick={handleCompleteReturn}
            >
              Complete Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentStatusPanel({
  review, isLoading, onConfirm, confirming,
}: {
  review: import("@/types").PaymentReviewView | undefined;
  isLoading: boolean;
  onConfirm: () => void;
  confirming: boolean;
}) {
  if (isLoading || !review) {
    return <Skeleton className="h-32 w-full" />;
  }
  return (
    <div className="space-y-2 text-sm">
      {review.status === "verified" ? (
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-4 w-4" /> <span className="font-semibold">Payment Successful</span>
        </div>
      ) : review.status === "paid" ? (
        <div className="flex items-center gap-2 text-warning">
          <Clock className="h-4 w-4" /> <span className="font-semibold">Paid — Awaiting Confirmation</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-destructive">
          <CreditCard className="h-4 w-4" /> <span className="font-semibold">Not Paid Yet</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Amount Paid</span>
        <span className="font-semibold">{formatCurrency(review.amount)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Payment Type</span>
        <span>Damage / Additional Return Charge</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Transaction ID</span>
        <span className="font-mono text-xs">{review.reference ?? "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Paid On</span>
        <span>{review.paidAt ? formatDateTime(review.paidAt) : "—"}</span>
      </div>
      {review.status === "paid" && (
        <Button className="w-full" onClick={onConfirm} disabled={confirming}>
          {confirming ? "Confirming..." : "Confirm Payment"}
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

function SettlementBreakdown({
  depositAmount, lateFee, damageFee, otherCharges, totalCharges, refund, due,
}: {
  depositAmount: number;
  lateFee: number;
  damageFee: number;
  otherCharges: number;
  totalCharges: number;
  refund: number;
  due: number;
}) {
  return (
    <div className="space-y-2 text-sm">
      <Row icon={<ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />} label="Security Deposit" value={formatCurrency(depositAmount)} />
      <Row label="Late Fee" value={formatCurrency(lateFee)} muted />
      <Row label="Damage Fee" value={damageFee > 0 ? `-${formatCurrency(damageFee)}` : formatCurrency(0)} negative={damageFee > 0} />
      <Row label="Other Charges" value={otherCharges > 0 ? `-${formatCurrency(otherCharges)}` : formatCurrency(0)} negative={otherCharges > 0} />
      <div className="h-px bg-border" />
      <Row label="Total Charges" value={formatCurrency(totalCharges)} bold />
      <Row label="Deposit Used" value={formatCurrency(Math.min(depositAmount, totalCharges))} />
      <div className="h-px bg-border" />
      {due > 0 ? (
        <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-3">
          <span className="text-sm font-bold text-destructive">Additional Amount Due</span>
          <span className="text-xl font-black text-destructive">{formatCurrency(due)}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-success/10 p-3">
          <span className="text-sm font-bold text-success">{refund > 0 ? "Refund to Rider" : "Settlement"}</span>
          <span className="text-xl font-black text-success">{refund > 0 ? formatCurrency(refund) : "Fully Adjusted"}</span>
        </div>
      )}
    </div>
  );
}

interface TimelineEntry {
  label: string;
  detail?: string;
  at: string | null;
}

/**
 * Assembled client-side from fields already on the page — no new backend
 * timeline table. Entries with no timestamp yet (`at: null`) render as the
 * next pending step rather than being dropped.
 */
function ReturnActivityTimeline({
  returnRequestedAt, inspectedAt, damages, paymentReview, returnApprovedAt,
}: {
  returnRequestedAt: string | null;
  inspectedAt: string | null;
  damages: Damage[];
  paymentReview: PaymentReviewView | undefined;
  returnApprovedAt: string | null;
}) {
  const entries: TimelineEntry[] = [
    { label: "Return requested", at: returnRequestedAt },
    { label: "Vehicle inspection completed", at: inspectedAt },
  ];

  for (const d of damages.filter((d) => d.status !== "waived")) {
    entries.push({ label: "Damage charge added", detail: formatCurrency(d.amount), at: d.created_at });
  }

  if (paymentReview) {
    entries.push({
      label: "Payment received", detail: formatCurrency(paymentReview.amount), at: paymentReview.paidAt,
    });
    if (paymentReview.status === "verified") {
      entries.push({ label: "Payment confirmed by admin", at: paymentReview.paidAt });
    }
  }

  entries.push({ label: "Return completed", at: returnApprovedAt });

  return (
    <div className="space-y-3">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2.5 text-sm">
          {entry.at
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div>
            <p className={cn("font-medium", !entry.at && "text-muted-foreground")}>
              {entry.label}{entry.detail ? ` — ${entry.detail}` : ""}
            </p>
            {entry.at && <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({
  icon, label, value, muted, negative, bold,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("flex items-center gap-1.5 text-muted-foreground", bold && "font-semibold text-foreground")}>
        {icon}
        {label}
      </span>
      <span className={cn(bold && "font-semibold", negative && "text-destructive", muted && "text-muted-foreground")}>
        {value}
      </span>
    </div>
  );
}
