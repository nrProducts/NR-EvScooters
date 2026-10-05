import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bike, PauseCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/common/Spinner";
import { useRiderImpactPreview } from "@/hooks/useSupport";
import * as vehiclesApi from "@/services/api/vehicles";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";
import type { RiderImpactDecision } from "@/types";

/**
 * Blocking decision required before a ride-linked support ticket can move to
 * "In progress" when its vehicle is currently held by an active rider — the
 * backend rejects the plain status update with `fields.requires_rider_impact`
 * (see support.service.ts's updateSupportRequest), which is what opens this.
 *
 * Two outcomes, both reusing existing maintenance machinery server-side:
 * Replace (swaps the rider onto a temp vehicle, same rental/plan) or Pause
 * (freezes their billing in place). Neither creates a new plan or charges
 * the rider again.
 */
export function RiderImpactModal({
  open,
  ticketId,
  onOpenChange,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean;
  ticketId: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (decision: RiderImpactDecision) => void;
  isPending: boolean;
  error?: unknown;
}) {
  const { data: preview, isLoading } = useRiderImpactPreview(ticketId ?? undefined, { enabled: open });
  const [choice, setChoice] = useState<"replace" | "pause" | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setChoice(null);
      setSelectedVehicleId(null);
    }
  }, [open]);

  const { data: availableVehicles, isLoading: loadingVehicles } = useQuery({
    queryKey: ["rider-impact-available-vehicles"],
    queryFn: () => vehiclesApi.fetchVehicles({
      status: "available", pageSize: 50, sortBy: "registration_number", sortDir: "asc",
    }),
    enabled: choice === "replace",
  });
  const vehicles = availableVehicles?.data ?? [];

  const canConfirm =
    choice === "pause" || (choice === "replace" && !!selectedVehicleId);

  const handleConfirm = () => {
    if (choice === "pause") onConfirm({ action: "pause" });
    else if (choice === "replace" && selectedVehicleId) {
      onConfirm({ action: "replace", replacement_vehicle_id: selectedVehicleId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rider impact required</DialogTitle>
          <DialogDescription>
            This vehicle is currently assigned to an active rider. Select how their plan should be handled while
            it's under maintenance.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Loading rider &amp; plan details…
          </div>
        ) : !preview?.required || !preview.vehicle || !preview.rider ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            No active rider is on this vehicle anymore — refresh and try again.
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Vehicle</span>
                <span className="font-medium">{preview.vehicle.registration_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Rider</span>
                <span className="font-medium">{preview.rider.full_name}</span>
              </div>
              {preview.plan && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Plan</span>
                    <span className="font-medium">{preview.plan.plan_name ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Current period ends</span>
                    <span className="font-medium">
                      {preview.plan.next_due_at ? formatDate(preview.plan.next_due_at) : "—"}
                    </span>
                  </div>
                  {preview.plan.outstanding_amount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Outstanding</span>
                      <span className="font-medium text-destructive">
                        {formatCurrency(preview.plan.outstanding_amount)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChoice("replace")}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs transition-smooth",
                  choice === "replace" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                )}
              >
                <Bike className="h-4 w-4" />
                <span className="font-medium">Assign Replacement Vehicle</span>
              </button>
              <button
                type="button"
                onClick={() => setChoice("pause")}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-xs transition-smooth",
                  choice === "pause" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                )}
              >
                <PauseCircle className="h-4 w-4" />
                <span className="font-medium">Pause Current Plan</span>
              </button>
            </div>

            {choice === "replace" && (
              <div className="space-y-1.5">
                <Select
                  value={selectedVehicleId ?? undefined}
                  onValueChange={setSelectedVehicleId}
                  disabled={loadingVehicles}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={loadingVehicles ? "Loading available vehicles…" : "Select a replacement vehicle"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.length === 0 && !loadingVehicles ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No available vehicles right now.
                      </div>
                    ) : (
                      vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} · {v.registration_number}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {loadingVehicles && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Spinner className="h-3 w-3" /> Loading available vehicles…
                  </p>
                )}
              </div>
            )}

            {choice === "pause" && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The rider's plan is frozen — no charges, no lost days — until this ticket is resolved.
              </p>
            )}
          </div>
        )}

        {!!error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button disabled={!canConfirm || isPending} onClick={handleConfirm}>
            {isPending ? "Saving…" : "Confirm & Start Maintenance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
