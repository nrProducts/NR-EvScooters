import { useEffect, useState } from "react";
import { Clock, Wrench, Ban, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssignVehicleToRiderPalette } from "@/components/vehicles/AssignVehicleToRiderPalette";
import {
  useTriageQuickFix, useAssignTempVehicle, useResolveNotRepairable, useReassignAfterScrap,
} from "@/hooks/useMaintenance";
import { ApiError } from "@/services/api/httpClient";
import { cn } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { MaintenanceTicket } from "@/types";

type Choice = "quick_fix" | "standard_temp" | "not_repairable";

/**
 * "Admin verifies the vehicle condition" step from the maintenance flow —
 * a 3-way outcome picker. Quick fix and Not repairable resolve inline here;
 * Temp vehicle hands off to the shared AssignVehicleToRiderPalette (picking
 * the vehicle IS the confirmation there, same spotlight pattern as elsewhere).
 */
export function TriageDialog({
  ticket,
  onOpenChange,
}: {
  ticket: MaintenanceTicket | null;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const canComplete = hasAction(user, "maintenance", "complete");
  const canEdit = hasAction(user, "maintenance", "edit");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [readyAt, setReadyAt] = useState("");
  const [scrapReason, setScrapReason] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [tempVehicleTarget, setTempVehicleTarget] = useState<MaintenanceTicket | null>(null);
  const [reassignTarget, setReassignTarget] = useState<MaintenanceTicket | null>(null);

  const quickFix = useTriageQuickFix();
  const tempVehicle = useAssignTempVehicle();
  const notRepairable = useResolveNotRepairable();
  const reassign = useReassignAfterScrap();

  useEffect(() => {
    if (!ticket) {
      setChoice(null);
      setReadyAt("");
      setScrapReason("");
      setEstimatedValue("");
      quickFix.reset();
      notRepairable.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const error = quickFix.error ?? notRepairable.error;

  function handleChoose(next: Choice) {
    setChoice(next);
    if (next === "standard_temp" && ticket) {
      onOpenChange(false);
      setTempVehicleTarget(ticket);
    }
  }

  function confirmQuickFix() {
    if (!ticket || !readyAt) return;
    quickFix.mutate(
      { id: ticket.id, expectedReadyAt: new Date(readyAt).toISOString() },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function confirmNotRepairable() {
    if (!ticket) return;
    notRepairable.mutate(
      {
        id: ticket.id,
        input: {
          reason: scrapReason.trim(),
          estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          if (ticket.displaced_rider) setReassignTarget(ticket);
        },
      },
    );
  }

  return (
    <>
      <Dialog open={!!ticket} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {ticket?.vehicle?.name}</DialogTitle>
            <DialogDescription>What's the outcome after inspecting this vehicle?</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            {canComplete && (
              <button
                type="button"
                onClick={() => handleChoose("quick_fix")}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs transition-smooth",
                  choice === "quick_fix" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                )}
              >
                <Clock className="h-5 w-5" />
                Quick fix
              </button>
            )}
            <button
              type="button"
              disabled={!ticket?.displaced_rider || !canEdit}
              title={
                !ticket?.displaced_rider
                  ? "No rider was displaced by this ticket."
                  : !canEdit
                    ? "You don't have permission to assign a temporary vehicle."
                    : undefined
              }
              onClick={() => handleChoose("standard_temp")}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs transition-smooth hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Wrench className="h-5 w-5" />
              Temp vehicle
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleChoose("not_repairable")}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs transition-smooth",
                  choice === "not_repairable" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                )}
              >
                <Ban className="h-5 w-5" />
                Not repairable
              </button>
            )}
          </div>

          {choice === "quick_fix" && (
            <div className="space-y-1.5">
              <Label>Expected ready by</Label>
              <Input type="datetime-local" value={readyAt} onChange={(e) => setReadyAt(e.target.value)} />
            </div>
          )}

          {choice === "not_repairable" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Reason (at least 3 characters)</Label>
                <Textarea
                  value={scrapReason}
                  onChange={(e) => setScrapReason(e.target.value)}
                  placeholder="e.g. Frame damage beyond repair"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estimated salvage value (optional)</Label>
                <Input type="number" min={0} value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} />
              </div>
            </div>
          )}

          {!!error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {choice === "quick_fix" && (
              <Button disabled={!readyAt || quickFix.isPending} onClick={confirmQuickFix}>
                {quickFix.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm quick fix
              </Button>
            )}
            {choice === "not_repairable" && (
              <Button
                disabled={scrapReason.trim().length < 3 || notRepairable.isPending}
                onClick={confirmNotRepairable}
              >
                {notRepairable.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Scrap vehicle
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignVehicleToRiderPalette
        open={!!tempVehicleTarget}
        riderName={tempVehicleTarget?.displaced_rider?.full_name ?? "the rider"}
        title="Assign a temporary vehicle"
        subtitle={tempVehicleTarget ? `While ${tempVehicleTarget.vehicle?.name} is repaired` : undefined}
        onOpenChange={(o) => !o && setTempVehicleTarget(null)}
        onAssign={(vehicleId) => {
          if (!tempVehicleTarget) return Promise.reject(new Error("No ticket selected."));
          return tempVehicle.mutateAsync({ id: tempVehicleTarget.id, tempVehicleId: vehicleId });
        }}
      />

      <AssignVehicleToRiderPalette
        open={!!reassignTarget}
        riderName={reassignTarget?.displaced_rider?.full_name ?? "the rider"}
        title="Reassign to a new vehicle"
        subtitle={reassignTarget ? `${reassignTarget.vehicle?.name} was scrapped` : undefined}
        onOpenChange={(o) => !o && setReassignTarget(null)}
        onAssign={(vehicleId) => {
          if (!reassignTarget) return Promise.reject(new Error("No ticket selected."));
          return reassign.mutateAsync({ id: reassignTarget.id, replacementVehicleId: vehicleId });
        }}
      />
    </>
  );
}
