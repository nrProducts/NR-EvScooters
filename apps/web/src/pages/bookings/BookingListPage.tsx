import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { usePickupQueue, useAvailableVehicles, useConfirmPickup } from "@/hooks/useBookings";
import { useTableSort } from "@/hooks/useTableSort";
import type { PickupQueueFilters } from "@/services/api/bookings";
import { formatDate, formatCurrency } from "@/lib/utils";
import { computeLatePaymentFee } from "@/lib/latePaymentPolicy";
import { ApiError } from "@/services/api/httpClient";
import type { PickupBooking } from "@/types";

/**
 * Admin-facing view, one tab per stage of the booking/vehicle lifecycle:
 *   Payment successful -> Pending (confirmed) -> Admin confirms -> Assigned
 *   (fulfilled) -> Active/Due (fulfilled, split by plan_status) -> Completed.
 * Distinct from BookingStatus/PickupQueueFilters — several of these views
 * (Active, Due) are the SAME status filtered further by plan_status, and
 * "All" is deliberately no filter at all, so this can't just be the raw
 * status type.
 */
type BookingView = "pending" | "assigned" | "active" | "due" | "completed" | "cancelled" | "expired" | "all";

const VIEW_TABS: { value: BookingView; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "active", label: "Active" },
  { value: "due", label: "Due" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
  // Not part of the required tab set, but existing functionality — keeping
  // it rather than losing visibility into expired reservations.
  { value: "expired", label: "Expired" },
];

function filtersForView(view: BookingView): Pick<PickupQueueFilters, "status" | "planStatus"> {
  switch (view) {
    case "pending": return { status: "confirmed" };
    case "assigned": return { status: "fulfilled" };
    case "active": return { status: "fulfilled", planStatus: "active" };
    case "due": return { status: "fulfilled", planStatus: "due" };
    case "completed": return { status: "completed" };
    case "cancelled": return { status: "cancelled" };
    case "expired": return { status: "expired" };
    case "all": return {};
  }
}

export default function BookingListPage() {
  const [view, setView] = useState<BookingView>("pending");
  const [page, setPage] = useState(1);
  const [pickupTarget, setPickupTarget] = useState<PickupBooking | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = usePickupQueue({
    ...filtersForView(view),
    page,
    pageSize: 8,
    sortBy: sort.by as PickupQueueFilters["sortBy"],
    sortDir: sort.dir,
  });
  const { data: availableVehicles, isLoading: vehiclesLoading } = useAvailableVehicles(
    pickupTarget && !pickupTarget.vehicle ? pickupTarget.id : undefined,
  );
  const confirmPickup = useConfirmPickup();

  const columns: DataTableColumn<PickupBooking>[] = [
    { header: "Rider", key: "rider", render: (b) => b.rider.full_name },
    { header: "Vehicle model", key: "model", render: (b) => b.vehicle_model?.name ?? "—" },
    { header: "Station", key: "station", render: (b) => b.station?.name ?? "—", hideOnMobile: true },
    { header: "Plan", key: "plan", render: (b) => b.plan?.name ?? "—", hideOnMobile: true },
    {
      header: "Price",
      key: "price",
      render: (b) => (b.plan ? formatCurrency(b.plan.price) : "—"),
      hideOnMobile: true,
    },
    { header: "Start day", key: "start", sortKey: "start_day", render: (b) => formatDate(b.start_day) },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (b) => (b.vehicle ? `${b.vehicle.registration_number}` : "Not allocated yet"),
      hideOnMobile: true,
    },
    {
      header: "Status",
      key: "status",
      render: (b) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={b.status} />
          {/* plan_status is only meaningful once fulfilled (still riding) —
              null before pickup and after a genuine completion. */}
          {b.plan_status ? <StatusBadge status={b.plan_status} /> : null}
        </div>
      ),
    },
    {
      header: "Payment due",
      key: "payment_due",
      render: (b) => {
        if (!b.next_due_at) return "—";
        if (b.plan_status !== "due") {
          // Active (paid up) or paused (clock frozen) — just the date, no warning.
          return <span className="text-muted-foreground">{formatDate(b.next_due_at)}</span>;
        }
        // Same estimate the rider's own app shows them — see latePaymentPolicy.ts.
        const { daysLate, lateFeeAmount } = computeLatePaymentFee(b.next_due_at);
        return (
          <div className="text-destructive">
            <p className="font-medium">Due {formatDate(b.next_due_at)}</p>
            <p className="text-xs">
              {daysLate} day{daysLate === 1 ? "" : "s"} overdue · {formatCurrency(lateFeeAmount)} late fee
            </p>
          </div>
        );
      },
      hideOnMobile: true,
    },
    { header: "Created", key: "created_at", sortKey: "created_at", render: (b) => formatDate(b.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (b) => {
        if (b.status === "confirmed") {
          return (
            <Button
              size="sm"
              onClick={() => {
                setPickupTarget(b);
                setSelectedVehicleId(null);
              }}
            >
              <PackageCheck className="h-3.5 w-3.5" /> Confirm pickup
            </Button>
          );
        }
        return "—";
      },
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} bookings in this stage</p>
      </div>

      <Tabs value={view} onValueChange={(v) => { setView(v as BookingView); setPage(1); }}>
        <TabsList className="flex-wrap">
          {VIEW_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No bookings in this stage"
        />
        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      {/* Confirm pickup dialog */}
      <Dialog open={!!pickupTarget} onOpenChange={(o) => !o && setPickupTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm pickup</DialogTitle>
            <DialogDescription>
              {pickupTarget?.rider.full_name} — {pickupTarget?.vehicle_model?.name} at {pickupTarget?.station?.name}
            </DialogDescription>
          </DialogHeader>

          {pickupTarget?.vehicle ? (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{pickupTarget.vehicle.registration_number}</p>
              <p className="text-xs text-muted-foreground">
                {pickupTarget.vehicle.name} · {pickupTarget.vehicle.battery_percentage}% battery · already reserved
              </p>
            </div>
          ) : vehiclesLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !availableVehicles || availableVehicles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No vehicle has been auto-allocated yet, and none are available at this station right now.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">No vehicle was auto-allocated yet — pick one manually:</p>
              {availableVehicles.map((v) => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
                >
                  <div>
                    <p className="font-medium">{v.registration_number}</p>
                    <p className="text-xs text-muted-foreground">{v.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{v.battery_percentage}%</span>
                    <input
                      type="radio"
                      name="vehicle"
                      checked={selectedVehicleId === v.id}
                      onChange={() => setSelectedVehicleId(v.id)}
                    />
                  </div>
                </label>
              ))}
            </div>
          )}

          {confirmPickup.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {confirmPickup.error instanceof ApiError ? confirmPickup.error.message : "Something went wrong."}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickupTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={(!pickupTarget?.vehicle && !selectedVehicleId) || confirmPickup.isPending}
              onClick={() => {
                if (pickupTarget) {
                  confirmPickup.mutate(
                    { bookingId: pickupTarget.id, vehicleId: pickupTarget.vehicle ? undefined : selectedVehicleId! },
                    { onSuccess: () => setPickupTarget(null) },
                  );
                }
              }}
            >
              Confirm handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
