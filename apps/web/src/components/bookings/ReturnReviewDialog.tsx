import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useCompleteRide, useMoveRideToMaintenance, useRejectReturn } from "@/hooks/useRentals";
import { useRecordDamage } from "@/hooks/useDamages";
import { ApiError } from "@/services/api/httpClient";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { computeLatePaymentFee } from "@/lib/latePaymentPolicy";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { PickupBooking } from "@/types";

/**
 * Staff review of a rider's post-pickup return request. Approve reuses the
 * exact two-outcome (Available/Maintenance) pattern VehicleHistoryDialog's
 * Unassign dialog already uses for the same underlying mutations — a return
 * that needs inspection should never pass through "Available" even
 * transiently between two separate admin actions. Reject clears the request
 * and leaves the rental exactly as it was, active with nothing pending.
 */
export function ReturnReviewDialog({
  booking,
  onOpenChange,
}: {
  booking: PickupBooking | null;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const canAct = hasAction(user, "vehicles", "edit");

  const [outcome, setOutcome] = useState<"available" | "maintenance">("available");
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [damageAmount, setDamageAmount] = useState("");
  const [damageDescription, setDamageDescription] = useState("");
  const [damagePhotos, setDamagePhotos] = useState<File[]>([]);

  const completeRide = useCompleteRide();
  const moveToMaintenance = useMoveRideToMaintenance();
  const rejectReturn = useRejectReturn();
  const recordDamage = useRecordDamage();

  const isPending = completeRide.isPending || moveToMaintenance.isPending || rejectReturn.isPending || recordDamage.isPending;
  const error = completeRide.error ?? moveToMaintenance.error ?? rejectReturn.error ?? recordDamage.error;

  const close = () => {
    onOpenChange(false);
    setOutcome("available");
    setMaintenanceNotes("");
    setRejectReason("");
    setDamageAmount("");
    setDamageDescription("");
    setDamagePhotos([]);
  };

  const rental = booking?.active_rental ?? null;

  const hasDamageEntered = damageAmount.trim().length > 0;
  const damageAmountValid = hasDamageEntered && Number(damageAmount) > 0;
  const damageValid = !hasDamageEntered || (damageAmountValid && damageDescription.trim().length >= 3);

  /**
   * Damage is recorded first (reduces the refundable deposit, and bills the
   * rider for whatever exceeds it — see computeDamageDeduction in
   * damages.service.ts) so the return is only marked Available/Maintenance
   * once the inspection is actually on file. If recording the damage fails,
   * the return is deliberately left un-approved rather than silently
   * skipping the deposit adjustment.
   */
  const approveOutcome = () => {
    if (!rental) return;
    if (outcome === "available") {
      completeRide.mutate({ id: rental.id }, { onSuccess: close });
    } else {
      moveToMaintenance.mutate(
        { id: rental.id, input: { description: maintenanceNotes.trim() } },
        { onSuccess: close },
      );
    }
  };

  const handleApprove = () => {
    if (!rental) return;
    if (hasDamageEntered && damageAmountValid) {
      recordDamage.mutate(
        {
          rentalId: rental.id,
          input: { amount: Number(damageAmount), description: damageDescription.trim(), photos: damagePhotos },
        },
        { onSuccess: approveOutcome },
      );
    } else {
      approveOutcome();
    }
  };

  const handleReject = () => {
    if (!rental) return;
    rejectReturn.mutate({ id: rental.id, input: { reason: rejectReason.trim() } }, { onSuccess: close });
  };

  const paymentDue = booking?.plan_status === "due" && booking.next_due_at
    ? computeLatePaymentFee(booking.next_due_at)
    : null;

  return (
    <Dialog open={!!booking} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review return request</DialogTitle>
          <DialogDescription>
            {booking?.rider.full_name} — {booking?.vehicle?.registration_number ?? booking?.vehicle_model?.name}
          </DialogDescription>
        </DialogHeader>

        {booking && rental && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <Field label="Rider" value={booking.rider.full_name} />
              <Field label="Phone" value={booking.rider.phone ?? "—"} />
              <Field label="Vehicle" value={booking.vehicle ? `${booking.vehicle.name} · ${booking.vehicle.registration_number}` : "—"} />
              <Field
                label="Current vehicle status"
                value={booking.vehicle ? <StatusBadge status={booking.vehicle.status} /> : "—"}
              />
              <Field label="Booking ID" value={<span className="font-mono text-xs">{booking.id}</span>} />
              <Field label="Rental ID" value={<span className="font-mono text-xs">{rental.id}</span>} />
              <Field label="Rental started" value={formatDateTime(rental.started_at)} />
              <Field
                label="Return requested"
                value={rental.return_requested_at ? formatDateTime(rental.return_requested_at) : "—"}
              />
            </div>

            {(booking.return_late_fee_preview || paymentDue?.isLate) && (
              <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs font-semibold text-warning">Applicable charges</p>
                {booking.return_late_fee_preview && (
                  <p className="text-xs">
                    Late return: {booking.return_late_fee_preview.days_late} day
                    {booking.return_late_fee_preview.days_late === 1 ? "" : "s"} ·{" "}
                    {formatCurrency(booking.return_late_fee_preview.penalty_amount)}
                  </p>
                )}
                {paymentDue?.isLate && (
                  <p className="text-xs">
                    Outstanding payment: due {booking.next_due_at} · {paymentDue.daysLate} day
                    {paymentDue.daysLate === 1 ? "" : "s"} overdue · {formatCurrency(paymentDue.lateFeeAmount)} late fee
                  </p>
                )}
              </div>
            )}

            {(rental.return_reason || rental.return_feedback) && (
              <div className="space-y-1 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">Return notes</p>
                {rental.return_reason && <p className="text-xs capitalize">{rental.return_reason.replace(/_/g, " ")}</p>}
                {rental.return_feedback && <p className="text-xs text-muted-foreground">{rental.return_feedback}</p>}
              </div>
            )}

            {canAct && (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Label className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Vehicle inspection — damage (optional)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Leave the amount blank if the vehicle checks out clean. Entering an amount deducts it from the
                    rider&apos;s deposit refund, and bills them for whatever exceeds the deposit.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Damage amount (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={damageAmount}
                        onChange={(e) => setDamageAmount(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Photos (optional)</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => setDamagePhotos(Array.from(e.target.files ?? []))}
                      />
                    </div>
                  </div>
                  {hasDamageEntered && (
                    <Textarea
                      value={damageDescription}
                      onChange={(e) => setDamageDescription(e.target.value)}
                      placeholder="Describe the damage (at least 3 characters)"
                      rows={2}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Approve return — vehicle goes to</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOutcome("available")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm transition-smooth",
                        outcome === "available" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                      )}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      Available
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutcome("maintenance")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm transition-smooth",
                        outcome === "maintenance" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                      )}
                    >
                      <Wrench className="h-5 w-5" />
                      Maintenance
                    </button>
                  </div>
                  {outcome === "maintenance" && (
                    <Textarea
                      value={maintenanceNotes}
                      onChange={(e) => setMaintenanceNotes(e.target.value)}
                      placeholder="e.g. Front brake noise reported by rider"
                      rows={2}
                    />
                  )}
                  <Button
                    className="w-full"
                    disabled={isPending || !damageValid || (outcome === "maintenance" && maintenanceNotes.trim().length < 3)}
                    onClick={handleApprove}
                  >
                    {(completeRide.isPending || moveToMaintenance.isPending || recordDamage.isPending) && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Approve Return
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Reject return — reason (at least 3 characters)</Label>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Vehicle still due for the current billing period"
                    rows={2}
                  />
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    disabled={isPending || rejectReason.trim().length < 3}
                    onClick={handleReject}
                  >
                    {rejectReturn.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    <XCircle className="h-4 w-4" />
                    Reject Return
                  </Button>
                </div>
              </div>
            )}

            {!!error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
