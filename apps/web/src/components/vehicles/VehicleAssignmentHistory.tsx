import { useState } from "react";
import { CheckCircle2, Loader2, Wrench, UserX, Zap } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { AssignRiderPalette } from "@/components/vehicles/AssignRiderPalette";
import { useVehicle } from "@/hooks/useVehicles";
import { useCompleteRide, useMoveRideToMaintenance } from "@/hooks/useRentals";
import { ApiError } from "@/services/api/httpClient";
import { cn, formatDate } from "@/lib/utils";

/** Inline expanded-row panel for the Vehicles list: current assignment + assignment history, from rental_history already returned by GET /vehicles/:id. */
export function VehicleAssignmentHistory({ vehicleId }: { vehicleId: string }) {
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(vehicleId);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<"available" | "maintenance">("available");
  const [description, setDescription] = useState("");
  const completeRide = useCompleteRide();
  const moveToMaintenance = useMoveRideToMaintenance();

  if (isLoading) return <Skeleton className="h-28 w-full" />;
  if (isError || !vehicle) {
    return <ErrorState message="Could not load assignment history." onRetry={() => refetch()} />;
  }

  const current = vehicle.rental_history.find((r) => r.status === "active") ?? null;
  const previous = vehicle.rental_history.filter((r) => r.status !== "active");
  const isPending = completeRide.isPending || moveToMaintenance.isPending;
  const error = completeRide.error ?? moveToMaintenance.error;

  const closeDialog = () => {
    setUnassignOpen(false);
    setNextStatus("available");
    setDescription("");
  };

  const handleConfirm = () => {
    if (!current) return;
    if (nextStatus === "available") {
      completeRide.mutate({ id: current.id }, { onSuccess: closeDialog });
    } else {
      moveToMaintenance.mutate(
        { id: current.id, input: { description: description.trim() } },
        { onSuccess: closeDialog },
      );
    }
  };

  return (
    <>
      <Accordion type="single" collapsible defaultValue="current" className="rounded-lg border border-border bg-card px-4">
        <AccordionItem value="current">
          <AccordionTrigger>Current Assignment</AccordionTrigger>
          <AccordionContent>
            {current ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-medium">{current.rider?.full_name ?? "Unknown rider"}</p>
                  <p className="text-xs text-muted-foreground">From {formatDate(current.started_at)} · To Ongoing</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={current.status} />
                  <Button size="sm" variant="outline" onClick={() => setUnassignOpen(true)}>
                    <UserX className="h-3.5 w-3.5" /> Unassign
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">No rider currently assigned to this vehicle.</p>
                {vehicle.status === "available" && (
                  <Button size="sm" onClick={() => setAssignOpen(true)}>
                    <Zap className="h-3.5 w-3.5" /> Assign a rider
                  </Button>
                )}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="previous">
          <AccordionTrigger>Previous Users ({previous.length})</AccordionTrigger>
          <AccordionContent>
            {previous.length === 0 ? (
              <p className="text-sm text-muted-foreground">No previous assignments for this vehicle.</p>
            ) : (
              <div className="divide-y divide-border">
                {previous.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium">{r.rider?.full_name ?? "Unknown rider"}</p>
                      <p className="text-xs text-muted-foreground">
                        From {formatDate(r.started_at)} · To {r.ended_at ? formatDate(r.ended_at) : "—"}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={unassignOpen} onOpenChange={(o) => (o ? setUnassignOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign {current?.rider?.full_name ?? "rider"}</DialogTitle>
            <DialogDescription>Ends the current ride. Choose what happens to the vehicle next.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setNextStatus("available")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm transition-smooth",
                nextStatus === "available" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
              )}
            >
              <CheckCircle2 className="h-5 w-5" />
              Available
            </button>
            <button
              type="button"
              onClick={() => setNextStatus("maintenance")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-sm transition-smooth",
                nextStatus === "maintenance" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
              )}
            >
              <Wrench className="h-5 w-5" />
              Maintenance
            </button>
          </div>

          {nextStatus === "maintenance" && (
            <div className="space-y-1.5">
              <Label>Reason (at least 3 characters)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Brake noise reported by rider"
                rows={3}
              />
            </div>
          )}

          {!!error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              disabled={isPending || (nextStatus === "maintenance" && description.trim().length < 3)}
              onClick={handleConfirm}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm unassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignRiderPalette vehicle={assignOpen ? vehicle : null} onOpenChange={setAssignOpen} />
    </>
  );
}
