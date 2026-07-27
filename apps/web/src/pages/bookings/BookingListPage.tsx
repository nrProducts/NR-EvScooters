import { useState } from "react";
import { PackageCheck, CheckCircle2, XCircle, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  usePickupQueue, useAvailableVehicles, useConfirmPickup, useApproveBooking, useRejectBooking,
} from "@/hooks/useBookings";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";
import type { BookingStatus, PickupBooking } from "@/types";

const STATUS_TABS: { value: BookingStatus; label: string }[] = [
  { value: "pending_payment", label: "Pending" },
  { value: "confirmed", label: "Approved" },
  { value: "fulfilled", label: "Assigned" },
  { value: "cancelled", label: "Rejected/Cancelled" },
  { value: "expired", label: "Expired" },
];

export default function BookingListPage() {
  const [status, setStatus] = useState<BookingStatus>("pending_payment");
  const [page, setPage] = useState(1);
  const [pickupTarget, setPickupTarget] = useState<PickupBooking | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PickupBooking | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, isError, refetch } = usePickupQueue({ status, page, pageSize: 8 });
  const { data: availableVehicles, isLoading: vehiclesLoading } = useAvailableVehicles(
    pickupTarget && !pickupTarget.vehicle ? pickupTarget.id : undefined,
  );
  const confirmPickup = useConfirmPickup();
  const approveBooking = useApproveBooking();
  const rejectBooking = useRejectBooking();

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
    { header: "Start day", key: "start", render: (b) => formatDate(b.start_day) },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (b) => (b.vehicle ? `${b.vehicle.registration_number}` : "Not allocated yet"),
      hideOnMobile: true,
    },
    { header: "Status", key: "status", render: (b) => <StatusBadge status={b.status} /> },
    {
      header: "Actions",
      key: "actions",
      render: (b) => {
        if (b.status === "pending_payment") {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => approveBooking.mutate(b.id)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setRejectTarget(b);
                    setRejectReason("");
                  }}
                >
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
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

      <Tabs value={status} onValueChange={(v) => { setStatus(v as BookingStatus); setPage(1); }}>
        <TabsList className="flex-wrap">
          {STATUS_TABS.map((t) => (
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

      <p className="text-xs text-muted-foreground">
        "Ride Active" and "Completed" aren't distinguished here — once a booking is Assigned, its ride's live
        status is tracked on the Rentals/Ride Management screen instead.
      </p>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject booking</DialogTitle>
            <DialogDescription>{rejectTarget?.rider.full_name} — {rejectTarget?.vehicle_model?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          {rejectBooking.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rejectBooking.error instanceof ApiError ? rejectBooking.error.message : "Something went wrong."}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length < 3 || rejectBooking.isPending}
              onClick={() => {
                if (rejectTarget) {
                  rejectBooking.mutate(
                    { bookingId: rejectTarget.id, reason: rejectReason.trim() },
                    { onSuccess: () => setRejectTarget(null) },
                  );
                }
              }}
            >
              Reject booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
