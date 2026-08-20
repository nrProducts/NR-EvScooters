import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Plus, ShieldCheck, Trash2, Wrench, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { useReturnDetail, useApproveReturnSettlement } from "@/hooks/useReturns";
import { useMoveRideToMaintenance, useRejectReturn } from "@/hooks/useRentals";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";

interface DamageItemForm {
  amount: string;
  description: string;
}

interface OtherChargeForm {
  label: string;
  amount: string;
}

export default function ReturnDetailPage() {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useReturnDetail(rentalId);
  const approveSettlement = useApproveReturnSettlement();
  const moveToMaintenance = useMoveRideToMaintenance();
  const rejectReturn = useRejectReturn();

  const [damageItems, setDamageItems] = useState<DamageItemForm[]>([]);
  const [inspectedClean, setInspectedClean] = useState(false);
  const [lateFeeOverride, setLateFeeOverride] = useState("");
  const [otherCharges, setOtherCharges] = useState<OtherChargeForm[]>([]);
  const [outcome, setOutcome] = useState<"available" | "maintenance">("available");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError || !data) return <ErrorState message="Return not found." onRetry={() => refetch()} />;

  const { rental, deposit, latePreview } = data;
  const settlement = data.settlement;
  const alreadySettled = rental.status === "completed";

  const itemValid = (item: DamageItemForm) => Number(item.amount) > 0 && item.description.trim().length >= 3;
  const hasDamageItems = damageItems.length > 0;
  const damageValid = hasDamageItems ? damageItems.every(itemValid) : true;
  const hasInspection = inspectedClean || (hasDamageItems && damageItems.every(itemValid));

  const otherChargeValid = (c: OtherChargeForm) => c.label.trim().length >= 2 && Number(c.amount) > 0;
  const otherChargesValid = otherCharges.every(otherChargeValid);

  const hasLateFeeOverride = lateFeeOverride.trim().length > 0;
  const lateFeeOverrideValid = !hasLateFeeOverride
    || (!Number.isNaN(Number(lateFeeOverride)) && Number(lateFeeOverride) >= 0);

  // Live settlement preview — mirrors the backend's exact formula
  // (deposit - late fee - damage - other charges) so admin sees the real
  // number before submitting.
  const previewLateFee = hasLateFeeOverride ? Number(lateFeeOverride) : latePreview.penaltyAmount;
  const previewDamageFee = damageItems.filter(itemValid).reduce((sum, i) => sum + Number(i.amount), 0);
  const previewOtherCharges = otherCharges.filter(otherChargeValid).reduce((sum, c) => sum + Number(c.amount), 0);
  const depositAmount = deposit?.amount ?? 0;
  const previewTotalCharges = previewLateFee + previewDamageFee + previewOtherCharges;
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
          onError: (err) => setFormError(err instanceof ApiError ? err.message : "Something went wrong."),
        },
      );
      return;
    }

    approveSettlement.mutate(
      {
        rentalId,
        input: {
          damageItems: damageItems.filter(itemValid).map((i) => ({
            amount: Number(i.amount), description: i.description.trim(), photoPaths: [],
          })),
          lateFeeOverride: hasLateFeeOverride ? Number(lateFeeOverride) : undefined,
          otherCharges: otherCharges.filter(otherChargeValid).map((c) => ({ label: c.label.trim(), amount: Number(c.amount) })),
        },
      },
      {
        onError: (err) => setFormError(err instanceof ApiError ? err.message : "Something went wrong."),
      },
    );
  };

  const handleReject = () => {
    if (!rentalId) return;
    rejectReturn.mutate(
      { id: rentalId, input: { reason: rejectReason.trim() } },
      { onSuccess: () => navigate("/returns") },
    );
  };

  const isPending = approveSettlement.isPending || moveToMaintenance.isPending || rejectReturn.isPending;

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
          {/* Two SEPARATE statuses — never merge scooter-return state with financial settlement state. */}
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6875rem] text-muted-foreground">Scooter Return:</span>
            <StatusBadge status={alreadySettled ? "completed" : "return_requested"} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.6875rem] text-muted-foreground">Financial Settlement:</span>
            <StatusBadge status={settlement?.status ?? "pending_refund"} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left — Charges */}
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

            {alreadySettled ? (
              settlement && (
                <div className="space-y-1.5 text-sm">
                  {settlement.late_fee_amount > 0 && <SettledLine label="Late Fee" amount={settlement.late_fee_amount} />}
                  {settlement.damage_fee_amount > 0 && <SettledLine label="Damage Fee" amount={settlement.damage_fee_amount} />}
                  {settlement.other_charges.map((c, i) => <SettledLine key={i} label={c.label} amount={c.amount} />)}
                </div>
              )
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

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Label className="text-xs font-semibold">Late fee</Label>
                  <p className="text-xs text-muted-foreground">
                    {latePreview.daysLate > 0
                      ? `System-computed: ${formatCurrency(latePreview.penaltyAmount)} (${latePreview.daysLate} day${latePreview.daysLate === 1 ? "" : "s"} late).`
                      : "No late fee was computed for this return."}{" "}
                    Leave blank to use the computed amount, or enter a custom figure.
                  </p>
                  <Input
                    type="number" min={0} value={lateFeeOverride}
                    placeholder={String(latePreview.penaltyAmount)}
                    onChange={(e) => setLateFeeOverride(e.target.value)}
                  />
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

        {/* Right — Settlement */}
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
            ) : (
              <SettlementSummary
                depositAmount={depositAmount}
                totalCharges={previewTotalCharges}
                refund={previewRefund}
                due={previewDue}
              />
            )}

            {!alreadySettled && (
              <>
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
                    disabled={
                      isPending || !damageValid || !hasInspection || !lateFeeOverrideValid || !otherChargesValid
                      || (outcome === "maintenance" && maintenanceNotes.trim().length < 3)
                    }
                    onClick={handleApprove}
                  >
                    Approve Return
                  </Button>
                </div>

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

                {formError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{formError}</p>}
              </>
            )}
          </CardContent>
        </Card>
      </div>
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
