import { useEffect, useState } from "react";
import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/common/Spinner";
import { useControlVehicle } from "@/hooks/useTelematics";
import { ApiError } from "@/services/api/httpClient";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import type { ControlAction } from "@/services/api/telematics";

const MOVING_KMPH = 5;

const norm = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

/**
 * Immobilise / mobilise a scooter — ADMIN ONLY (the server enforces it; the
 * caller only shows the button to admins).
 *
 * Deliberately heavy: a written reason, the registration number typed back,
 * and an explicit acknowledgement when the scooter is moving. None of it can
 * be pre-filled or skipped, so the wrong scooter cannot be stopped by a stray
 * click, and a rider cannot be stopped at speed by accident.
 */
export function VehicleControlDialog({
  open, onOpenChange, vehicleId, registrationNumber, action, speedKmph,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  registrationNumber: string;
  action: ControlAction;
  /** Latest speed when the reading is live, else null. */
  speedKmph: number | null;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [ackMoving, setAckMoving] = useState(false);
  const control = useControlVehicle();

  useEffect(() => {
    if (open) { setReason(""); setTyped(""); setAckMoving(false); control.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const immobilise = action === "immobilise";
  const moving = immobilise && speedKmph !== null && speedKmph >= MOVING_KMPH;
  const canSubmit =
    reason.trim().length >= 5 && norm(typed) === norm(registrationNumber) && (!moving || ackMoving) && !control.isPending;

  const submit = () => {
    control.mutate(
      {
        vehicleId, action,
        input: { reason: reason.trim(), confirmRegistration: typed.trim(), acknowledgeMoving: moving && ackMoving },
      },
      {
        onSuccess: () => {
          toastSuccess(`${immobilise ? "Immobilise" : "Mobilise"} command sent — the scooter confirms within about 5 minutes`);
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Could not send the command"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {immobilise ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            {immobilise ? "Immobilise" : "Mobilise"} {registrationNumber}
          </DialogTitle>
          <DialogDescription>
            {immobilise
              ? "This cuts the scooter's drive. The rider will not be able to ride it until you mobilise it again."
              : "This lets the scooter be ridden again."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {moving ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" /> This scooter is moving at {Math.round(speedKmph as number)} km/h
              </p>
              <p className="text-xs text-muted-foreground">
                Cutting power while it is moving can cause a crash. Prefer to wait until it has stopped.
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--destructive))]"
                  checked={ackMoving}
                  onChange={(e) => setAckMoving(e.target.checked)}
                />
                I understand the risk and still want to send this now.
              </label>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Reason (kept in the audit log)</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={immobilise ? "e.g. Payment overdue 5 days, rider not responding" : "e.g. Payment received"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              Type <span className="font-mono font-semibold">{registrationNumber}</span> to confirm
            </Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>

          {control.isError ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {control.error instanceof ApiError ? control.error.message : "Something went wrong."}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={immobilise ? "destructive" : "default"} disabled={!canSubmit} onClick={submit}>
            {control.isPending && <Spinner className="h-4 w-4" />}
            {immobilise ? "Immobilise scooter" : "Mobilise scooter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
