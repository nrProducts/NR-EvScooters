import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SearchBar } from "@/components/common/SearchBar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RentalOperationsSummaryCards } from "@/components/bookings/RentalOperationsSummaryCards";
import { usePickupQueue, useAvailableVehicles, useConfirmPickup, useSetLateFeeOverride } from "@/hooks/useBookings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import type { PickupQueueFilters } from "@/services/api/bookings";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { ApiError } from "@/services/api/httpClient";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { BookingRefundStatus, PickupBooking } from "@/types";

const REFUND_STATUS_LABEL: Record<BookingRefundStatus, string> = {
  pending: "Awaiting Approval",
  processing: "Refund Initiated",
  processed: "Refunded",
  not_required: "No Refund Due",
  failed: "Refund Failed",
};

const REFUND_STATUS_VARIANT: Record<BookingRefundStatus, "success" | "warning" | "destructive" | "muted"> = {
  pending: "warning",
  processing: "warning",
  processed: "success",
  not_required: "muted",
  failed: "destructive",
};

function RefundStatusBadge({ status }: { status: BookingRefundStatus }) {
  return <Badge variant={REFUND_STATUS_VARIANT[status]}>{REFUND_STATUS_LABEL[status]}</Badge>;
}

/**
 * Admin-facing view, one tab per stage of the full rental lifecycle:
 *   Payment successful -> Pending (confirmed) -> Admin confirms -> Assigned
 *   (fulfilled) -> Active/Due (fulfilled, split by plan_status) -> rider
 *   requests a return -> Return Requests -> staff approve/reject -> Completed.
 * Distinct from BookingStatus/PickupQueueFilters — several of these views
 * (Active, Due, Return Requests) are the SAME status filtered further, and
 * "All" is deliberately no filter at all, so this can't just be the raw
 * status type.
 */
type RentalOpsView =
  | "pending" | "assigned" | "active" | "due" | "scheduled_renewals"
  | "completed" | "cancelled" | "expired" | "all";

const VIEW_TABS: { value: RentalOpsView; label: string }[] = [
  { value: "pending", label: "Pending Bookings" },
  { value: "assigned", label: "Assigned" },
  { value: "active", label: "Active" },
  { value: "due", label: "Due" },
  // Upcoming/scheduled renewals — a rider already paid ahead, current plan
  // stays active until scheduled_start_date, kept separate from Active so
  // staff can see who's already renewed vs. who hasn't.
  { value: "scheduled_renewals", label: "Scheduled Renewals" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
  // Not part of the required tab set, but existing functionality — keeping
  // it rather than losing visibility into expired reservations.
  { value: "expired", label: "Expired" },
];

function filtersForView(
  view: RentalOpsView,
): Pick<PickupQueueFilters, "status" | "planStatus" | "renewalStatus" | "returnRequested"> {
  switch (view) {
    case "pending": return { status: "confirmed" };
    case "assigned": return { status: "fulfilled" };
    case "active": return { status: "fulfilled", planStatus: "active" };
    case "due": return { status: "fulfilled", planStatus: "due" };
    case "scheduled_renewals": return { status: "fulfilled", renewalStatus: "scheduled" };
    case "completed": return { status: "completed" };
    case "cancelled": return { status: "cancelled" };
    case "expired": return { status: "expired" };
    case "all": return {};
  }
}

export default function BookingListPage() {
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<RentalOpsView>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickupTarget, setPickupTarget] = useState<PickupBooking | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [lateFeeTarget, setLateFeeTarget] = useState<PickupBooking | null>(null);
  const [lateFeeInput, setLateFeeInput] = useState("");
  const [lateFeeError, setLateFeeError] = useState<string | null>(null);
  const setLateFeeOverride = useSetLateFeeOverride();

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = usePickupQueue({
    ...filtersForView(view),
    search: search || undefined,
    page,
    pageSize: 8,
    sortBy: sort.by as PickupQueueFilters["sortBy"],
    sortDir: sort.dir,
  });
  const { data: availableVehicles, isLoading: vehiclesLoading } = useAvailableVehicles(
    pickupTarget && !pickupTarget.vehicle ? pickupTarget.id : undefined,
  );
  const confirmPickup = useConfirmPickup();

  const baseColumns: DataTableColumn<PickupBooking>[] = [
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
          {b.active_rental?.return_requested_at ? <StatusBadge status="return_requested" /> : null}
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
        const daysLate = Math.max(0, Math.round((Date.now() - new Date(`${b.next_due_at}T00:00:00`).getTime()) / 86_400_000));
        return (
          <div className="text-destructive">
            <p className="font-medium">Due {formatDate(b.next_due_at)}</p>
            <p className="text-xs">
              {daysLate} day{daysLate === 1 ? "" : "s"} overdue
              {b.late_fee_override != null ? ` · ${formatCurrency(b.late_fee_override)}/day override` : " · late fee applies"}
            </p>
          </div>
        );
      },
      hideOnMobile: true,
    },
    {
      header: "Renewal",
      key: "renewal",
      render: (b) => (
        b.renewal_status === "scheduled"
          ? (
            <div>
              <Badge variant="success">Scheduled</Badge>
              <p className="text-xs text-muted-foreground mt-0.5">
                Starts {b.scheduled_start_date ? formatDate(b.scheduled_start_date) : "—"}
              </p>
            </div>
          )
          : <span className="text-muted-foreground">—</span>
      ),
      hideOnMobile: true,
    },
    { header: "Created", key: "created_at", sortKey: "created_at", render: (b) => formatDate(b.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (b) => {
        if (b.status === "confirmed" && hasAction(user, "bookings", "edit")) {
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
        if (b.status === "fulfilled" && hasAction(user, "bookings", "edit")) {
          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLateFeeTarget(b);
                setLateFeeInput(b.late_fee_override != null ? String(b.late_fee_override) : "");
                setLateFeeError(null);
              }}
            >
              Late fee override
            </Button>
          );
        }
        return "—";
      },
    },
  ];

  /** Cancelled tab gets its own column set — cancellation + refund tracking, not pickup/payment-due fields that never apply here. */
  const cancelledColumns: DataTableColumn<PickupBooking>[] = [
    { header: "Rider", key: "rider", render: (b) => b.rider.full_name },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (b) => (
        <span>
          {b.vehicle_model?.name ?? "—"}
          {b.station?.name ? ` · ${b.station.name}` : ""}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      header: "Cancelled",
      key: "cancelled_at",
      sortKey: "created_at",
      render: (b) => (b.cancelled_at ? formatDateTime(b.cancelled_at) : "—"),
    },
    {
      header: "Reason",
      key: "cancellation_reason",
      render: (b) => <span className="text-xs text-muted-foreground">{b.cancellation_reason ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      header: "Cancellation fee",
      key: "cancellation_penalty_amount",
      render: (b) => (b.cancellation_penalty_amount != null ? formatCurrency(b.cancellation_penalty_amount) : "—"),
    },
    {
      header: "Refund amount",
      key: "refund_amount",
      render: (b) => (b.refund_amount != null ? formatCurrency(b.refund_amount) : "—"),
    },
    {
      header: "Refund status",
      key: "refund_status",
      render: (b) => (b.refund_status ? <RefundStatusBadge status={b.refund_status} /> : "—"),
    },
    {
      header: "Refund initiated",
      key: "refund_initiated_at",
      render: (b) => (b.refund_initiated_at ? formatDateTime(b.refund_initiated_at) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Refund completed",
      key: "refund_completed_at",
      render: (b) => (b.refund_completed_at ? formatDateTime(b.refund_completed_at) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Transaction ID",
      key: "refund_transaction_id",
      render: (b) => <span className="font-mono text-xs">{b.refund_transaction_id ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      header: "Booking",
      key: "id",
      render: (b) => (
        <Link
          to={`/payments?bookingId=${b.id}`}
          className="text-xs underline"
          onClick={(e) => e.stopPropagation()}
        >
          View payments
        </Link>
      ),
    },
  ];

  const columns = view === "cancelled" ? cancelledColumns : baseColumns;

  usePageSubtitle("Manage the full rental lifecycle, from booking to return.");

  return (
    <div className="space-y-4 animate-fade-in">
      <RentalOperationsSummaryCards />

      <Tabs value={view} onValueChange={(v) => { setView(v as RentalOpsView); setPage(1); }}>
        <TabsList className="flex-wrap">
          {VIEW_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <div className="border-b border-border p-4">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by rider, vehicle, booking id or rental id..."
            className="sm:max-w-sm"
          />
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No bookings match your filters"
          sort={sort}
          onSortChange={onSortChange}
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
                {pickupTarget.vehicle.name} · already reserved
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


      {/* Late fee override — per-booking, wins over the global setting on billing/BillingPage whenever this rider renews late. */}
      <Dialog open={!!lateFeeTarget} onOpenChange={(o) => !o && setLateFeeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Late renewal fee override</DialogTitle>
            <DialogDescription>
              {lateFeeTarget?.rider.full_name} — a per-day rate; leave blank to use the global rate instead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Override rate (₹ per day)</Label>
            <Input
              type="number"
              min={0}
              placeholder="Use global setting"
              value={lateFeeInput}
              onChange={(e) => { setLateFeeError(null); setLateFeeInput(e.target.value); }}
            />
          </div>

          {lateFeeError && <p className="text-xs text-destructive">{lateFeeError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLateFeeTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={setLateFeeOverride.isPending}
              onClick={() => {
                if (!lateFeeTarget) return;
                const trimmed = lateFeeInput.trim();
                const parsed = trimmed === "" ? null : Number(trimmed);
                if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
                  setLateFeeError("Enter a valid, non-negative amount, or leave it blank.");
                  return;
                }
                setLateFeeOverride.mutate(
                  { bookingId: lateFeeTarget.id, lateFeeOverride: parsed },
                  {
                    onSuccess: () => setLateFeeTarget(null),
                    onError: (err) => setLateFeeError(err instanceof Error ? err.message : "Could not save."),
                  },
                );
              }}
            >
              {setLateFeeOverride.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
