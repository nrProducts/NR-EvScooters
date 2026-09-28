import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wrench, UserX, Zap, Bike, CornerDownRight, Undo2 } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { AssignRiderPalette } from "@/components/vehicles/AssignRiderPalette";
import { useVehicle, useUnassignVehicle } from "@/hooks/useVehicles";
import { ApiError } from "@/services/api/httpClient";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { VehicleMaintenanceRecord, VehicleRentalRecord } from "@/types";

type TimelineNode =
  | { kind: "assignment"; id: string; at: string; rental: VehicleRentalRecord }
  | { kind: "maintenance"; id: string; at: string; ticket: VehicleMaintenanceRecord };

/**
 * Full vehicle history as a branching tree instead of a flat accordion — the
 * trunk is the vehicle's own timeline (assignments + maintenance tickets,
 * newest first); a maintenance ticket that issued a temp vehicle grows a
 * side branch off its node instead of appearing as a disconnected row.
 */
export function VehicleHistoryDialog({
  vehicleId,
  onOpenChange,
}: {
  vehicleId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(vehicleId ?? undefined);
  const [unassignOpen, setUnassignOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reason, setReason] = useState("");
  const unassignVehicle = useUnassignVehicle();

  const current = vehicle?.rental_history.find((r) => r.status === "active") ?? null;

  const closeUnassign = () => {
    setUnassignOpen(false);
    setReason("");
  };

  /**
   * Used to call completeRide/moveRideToMaintenance directly — which meant
   * an "Available"/"Maintenance" choice right in this dialog completed the
   * ride immediately, no inspection. That only works when there is nothing
   * to inspect: assertInspected (rentals.service.ts) blocks it outright the
   * moment a deposit is actually held, which is the common case — every
   * click here failed with "Record the vehicle inspection..." and no way
   * to actually do that from this dialog. It now opens the same
   * admin-initiated return requestReturn's rider-facing counterpart does
   * (adminUnassignVehicle) and hands off to the real Inspection → Payment
   * Gate → Approve Return flow, where that choice already lives.
   */
  const handleConfirmUnassign = () => {
    if (!vehicle) return;
    unassignVehicle.mutate(
      { id: vehicle.id, reason },
      {
        onSuccess: ({ rentalId }) => {
          toastSuccess("Return started — continue in the review flow");
          closeUnassign();
          onOpenChange(false);
          navigate(`/bookings/returns/${rentalId}`);
        },
        onError: (err) => toastError(err, "Could not unassign vehicle"),
      },
    );
  };

  const nodes: TimelineNode[] = vehicle
    ? [
        ...vehicle.rental_history
          .filter((r) => r.status !== "active")
          .map((r): TimelineNode => ({ kind: "assignment", id: r.id, at: r.started_at, rental: r })),
        ...vehicle.maintenance_history.map(
          (m): TimelineNode => ({ kind: "maintenance", id: m.id, at: m.created_at, ticket: m }),
        ),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    : [];

  return (
    <>
      <Dialog open={!!vehicleId} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>{vehicle?.name ?? "Vehicle history"}</DialogTitle>
            <DialogDescription>{vehicle?.registration_number}</DialogDescription>
          </DialogHeader>

          {isLoading && <Skeleton className="h-40 w-full" />}
          {isError && <ErrorState message="Could not load this vehicle's history." onRetry={() => refetch()} />}

          {vehicle && (
            <div className="flex min-h-0 flex-1 flex-col gap-5">
              {/* Trunk root — current status. Stays put; only the timeline below scrolls. */}
              <div
                className={cn(
                  "flex shrink-0 flex-col gap-3 rounded-2xl border p-3.5",
                  current?.return_requested_at ? "border-warning/40 bg-warning/5" : "border-primary/30 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Bike className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {current ? current.rider?.full_name ?? "Unknown rider" : "Currently unassigned"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {current ? `Assigned since ${formatDate(current.started_at)}` : "No active rider"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={vehicle.status} />
                    {current && (
                      <Button size="sm" variant="outline" onClick={() => setUnassignOpen(true)}>
                        <UserX className="h-3.5 w-3.5" /> Unassign
                      </Button>
                    )}
                    {!current && vehicle.status === "available" && hasAction(user, "vehicles", "assign") && (
                      <Button size="sm" onClick={() => setAssignOpen(true)}>
                        <Zap className="h-3.5 w-3.5" /> Assign
                      </Button>
                    )}
                  </div>
                </div>

                {current?.return_requested_at && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-warning">
                    <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="min-w-0 text-xs">
                      <p className="font-semibold">
                        Return requested {formatDateTime(current.return_requested_at)}
                        {current.return_due_at && ` · due by ${formatDateTime(current.return_due_at)}`}
                      </p>
                      {current.return_reason && <p className="mt-0.5 text-warning/90">{current.return_reason}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Branching timeline — its own scroll region once it outgrows the dialog. */}
              {nodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No earlier history for this vehicle.</p>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pr-1">
                  {nodes.map((node, i) => {
                    const isLast = i === nodes.length - 1;
                    return (
                      <div key={`${node.kind}-${node.id}`} className={cn("relative pl-6", !isLast && "pb-5")}>
                        {!isLast && <span className="absolute left-[0.4375rem] top-3 h-full w-px bg-border" />}
                        {node.kind === "assignment" ? (
                          <>
                            <span className="absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-secondary ring-4 ring-card">
                              <span className="h-1.5 w-1.5 rounded-full bg-secondary-foreground" />
                            </span>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {node.rental.rider?.full_name ?? "Unknown rider"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(node.rental.started_at)} → {node.rental.ended_at ? formatDate(node.rental.ended_at) : "—"}
                                </p>
                              </div>
                              <StatusBadge status={node.rental.status} />
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-warning/20 ring-4 ring-card">
                              <Wrench className="h-2 w-2 text-warning" />
                            </span>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{node.ticket.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(node.ticket.created_at)}
                                  {node.ticket.outcome === "quick_fix" && node.ticket.expected_ready_at &&
                                    ` · Quick fix, ready by ${formatDate(node.ticket.expected_ready_at)}`}
                                  {node.ticket.outcome === "not_repairable" && " · Not repairable"}
                                </p>
                              </div>
                              <StatusBadge status={node.ticket.status} />
                            </div>

                            {/* Branch: temp vehicle issued during this ticket */}
                            {(node.ticket.outcome === "temp_vehicle"
                              || node.ticket.outcome === "replacement") && node.ticket.temp_vehicle && (
                              <div className="mt-2 flex items-center gap-1.5 border-l border-dashed border-border pl-3">
                                <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {node.ticket.outcome === "replacement" ? "Replaced with" : "Temp vehicle used"}:{" "}
                                  <span className="font-medium text-foreground">{node.ticket.temp_vehicle.name}</span>
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={unassignOpen} onOpenChange={(o) => (o ? setUnassignOpen(true) : closeUnassign())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign {current?.rider?.full_name ?? "rider"}?</DialogTitle>
            <DialogDescription>
              This ends their current plan on this vehicle. You&rsquo;ll land on the same return-review
              screen used for a rider-requested return — record any damage, settle the deposit, and
              choose whether the vehicle goes to Maintenance or back to Available there.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rider unreachable, reclaiming vehicle for another assignment"
              rows={3}
            />
          </div>

          {!!unassignVehicle.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {unassignVehicle.error instanceof ApiError ? unassignVehicle.error.message : "Something went wrong. Please try again."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeUnassign}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={unassignVehicle.isPending || reason.trim().length < 3}
              onClick={handleConfirmUnassign}
            >
              {unassignVehicle.isPending && <Spinner className="h-4 w-4" />}
              Unassign &amp; start return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignRiderPalette vehicle={assignOpen ? vehicle ?? null : null} onOpenChange={setAssignOpen} />
    </>
  );
}
