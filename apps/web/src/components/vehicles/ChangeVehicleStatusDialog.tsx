import { useEffect, useState, type ComponentType } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle, Repeat, UserX, Wrench } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/common/Spinner";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AssignVehicleToRiderPalette } from "@/components/vehicles/AssignVehicleToRiderPalette";
import { useChangeVehicleStatus } from "@/hooks/useVehicles";
import type { RiderAction } from "@/services/api/vehicles";
import { ApiError } from "@/services/api/httpClient";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { cn } from "@/lib/utils";
import type { Vehicle } from "@/types";

type Target = "available" | "maintenance";

const RIDER_ACTIONS: { value: RiderAction; label: string; hint: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: "temp_vehicle", label: "Give a temp scooter", hint: "They keep it after the repair.", icon: Repeat },
  { value: "pause", label: "Pause their plan", hint: "Resumes on this scooter after the repair.", icon: PauseCircle },
  { value: "end_plan", label: "End their plan", hint: "Deposit refund goes to Refunds for review.", icon: UserX },
];

function Choice({
  selected, disabled, onClick, icon: Icon, children,
}: {
  selected: boolean; disabled?: boolean; onClick: () => void;
  icon: ComponentType<{ className?: string }>; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs transition-smooth",
        "disabled:cursor-not-allowed disabled:opacity-40",
        selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
      )}
    >
      <Icon className="h-5 w-5" />
      {children}
    </button>
  );
}

/**
 * "Change status" from the Vehicles list. A scooter's status is derived on
 * the server, so each choice is an action rather than a field edit:
 *
 *   Available    closes any open maintenance and ends the current rider's
 *                plan right away (one confirmation; deposit refund queued).
 *   Maintenance  opens a ticket; a rider on the scooter first gets a temp
 *                scooter, a paused plan, or an ended plan.
 *
 * Picking "temp scooter" hands over to the shared vehicle picker, and the
 * pick itself submits, so staff never confirm twice.
 */
export function ChangeVehicleStatusDialog({
  vehicle, onOpenChange,
}: {
  vehicle: Vehicle | null;
  onOpenChange: (open: boolean) => void;
}) {
  const change = useChangeVehicleStatus();
  const [target, setTarget] = useState<Target | null>(null);
  const [description, setDescription] = useState("");
  const [riderAction, setRiderAction] = useState<RiderAction | null>(null);
  const [pickTemp, setPickTemp] = useState(false);

  // Fresh form each time the dialog opens, with the only possible move
  // preselected when there is just one.
  useEffect(() => {
    if (!vehicle) return;
    setTarget(vehicle.status === "maintenance" ? "available" : vehicle.status === "available" ? "maintenance" : null);
    setDescription("");
    setRiderAction(null);
    change.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id]);

  const rider = vehicle?.current_rider ?? null;
  const name = vehicle ? `${vehicle.name} (${vehicle.registration_number})` : "";

  const submit = (tempVehicleId?: string) => {
    if (!vehicle || !target) return Promise.resolve();
    const input = target === "available"
      ? { status: "available" as const }
      : {
          status: "maintenance" as const,
          description: description.trim(),
          ...(rider && riderAction ? { rider_action: riderAction } : {}),
          ...(tempVehicleId ? { temp_vehicle_id: tempVehicleId } : {}),
        };
    return change.mutateAsync({ id: vehicle.id, input }).then(() => {
      toastSuccess(target === "available" ? `${vehicle.name} is now available` : `${vehicle.name} moved to maintenance`);
      onOpenChange(false);
    });
  };

  const onConfirm = () => {
    if (target === "maintenance" && rider && riderAction === "temp_vehicle") {
      setPickTemp(true);
      return;
    }
    submit().catch((err) => toastError(err, "Could not change the status"));
  };

  const maintenanceReady = description.trim().length >= 3 && (!rider || !!riderAction);
  const canConfirm = target === "available" || (target === "maintenance" && maintenanceReady);
  const confirmLabel = target === "available"
    ? (rider ? `End ${rider.full_name}'s plan & set available` : "Set available")
    : rider && riderAction === "temp_vehicle"
      ? "Choose temp scooter…"
      : "Move to maintenance";

  return (
    <>
      <Dialog open={!!vehicle && !pickTemp} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <span>{name}</span>
              {vehicle && <StatusBadge status={vehicle.status} />}
              {rider && <span>· Ridden by <span className="font-medium text-foreground">{rider.full_name}</span></span>}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Choice
              icon={CheckCircle2}
              selected={target === "available"}
              disabled={vehicle?.status === "available"}
              onClick={() => setTarget("available")}
            >
              Available
            </Choice>
            <Choice
              icon={Wrench}
              selected={target === "maintenance"}
              disabled={vehicle?.status === "maintenance"}
              onClick={() => setTarget("maintenance")}
            >
              Maintenance
            </Choice>
          </div>

          {target === "available" && (
            <div className="space-y-2 text-sm">
              {rider && (
                <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    <span className="font-semibold">{rider.full_name}'s plan ends now.</span> Their deposit refund is
                    created as pending review in Refunds; nothing is paid out until it's approved. Unpaid bills stay
                    on their account.
                  </p>
                </div>
              )}
              {vehicle?.status === "maintenance" && (
                <p className="text-muted-foreground">
                  Its open maintenance tickets are closed. A rider who was given a temp scooter keeps it.
                </p>
              )}
              {!rider && vehicle?.status !== "maintenance" && (
                <p className="text-muted-foreground">The scooter becomes free to assign.</p>
              )}
            </div>
          )}

          {target === "maintenance" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="maintenance-issue">Issue (at least 3 characters)</Label>
                <Textarea
                  id="maintenance-issue"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's wrong with the scooter?"
                  rows={3}
                />
              </div>
              {rider && (
                <div className="space-y-1.5">
                  <Label>What happens to {rider.full_name}?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {RIDER_ACTIONS.map((a) => (
                      <Choice key={a.value} icon={a.icon} selected={riderAction === a.value} onClick={() => setRiderAction(a.value)}>
                        <span className="font-medium">{a.label}</span>
                        <span className="text-center text-[0.6875rem] text-muted-foreground">{a.hint}</span>
                      </Choice>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {change.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {change.error instanceof ApiError ? change.error.message : "Something went wrong. Please try again."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant={target === "available" && rider ? "destructive" : "default"}
              disabled={!canConfirm || change.isPending}
              onClick={onConfirm}
            >
              {change.isPending && <Spinner className="h-4 w-4" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignVehicleToRiderPalette
        open={pickTemp}
        riderName={rider?.full_name ?? "the rider"}
        title="Give a temp scooter"
        subtitle={vehicle ? `While ${vehicle.name} is repaired. They keep it afterwards.` : undefined}
        // Closing the picker without a pick returns to the dialog above.
        onOpenChange={setPickTemp}
        onAssign={(tempVehicleId) => submit(tempVehicleId)}
      />
    </>
  );
}
