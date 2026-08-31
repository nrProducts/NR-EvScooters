import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { PackageCheck } from "lucide-react";
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
import { AdminCreateBookingDialog } from "@/components/bookings/AdminCreateBookingDialog";
import { usePickupQueue, useAvailableVehicles, useConfirmPickup } from "@/hooks/useBookings";
import { useReturnRecoverySettings } from "@/hooks/useReturnRecoverySettings";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import type { PickupQueueFilters } from "@/services/api/bookings";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
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
 * Was the booking's own "Status" plus a separate "Return Status" column —
 * two columns for what is really one lifecycle position. Collapsed to the
 * plain four-stage flow: Booked -> Active -> Return Requested -> Completed.
 * `b.status` already carries the backend's derived "completed" value
 * (fulfilled + subscription ended), so no new data is needed here — this is
 * a display simplification, not a new source of truth. "Plan Status"
 * (Active/Past Due/Paused — the subscription's independent billing state)
 * stays its own separate column; only Status + Return Status merge.
 */
function lifecycleStatus(b: PickupBooking): { label: string; tone: "success" | "warning" | "info" | "destructive" | "muted" } {
  if (b.status === "cancelled") return { label: "Cancelled", tone: "destructive" };
  if (b.status === "expired") return { label: "Expired", tone: "destructive" };
  // Rider bookings are only created after payment now, so this is always an
  // admin-created booking still awaiting its offline/online payment — never a
  // confirmed booking.
  if (b.status === "pending_payment") return { label: "Awaiting payment", tone: "muted" };
  // "completed" must win over "return requested": return_requested_at is a
  // historical timestamp that's never cleared once set, so a booking whose
  // return was requested AND has since been approved (the booking's own
  // status has already flipped to the backend's derived "completed") would
  // otherwise show "Return Requested" forever.
  if (b.status === "completed") return { label: "Completed", tone: "success" };
  if (b.active_rental?.return_requested_at) return { label: "Return Requested", tone: "warning" };
  if (b.status === "fulfilled") return { label: "Active", tone: "success" };
  return { label: "Booked", tone: "info" }; // confirmed
}

/**
 * Read-only summary of return_recovery_settings.max_late_fee_days — the
 * actual editing happens on Billing & Charges now, in the same card as the
 * late-fee amount, so there's one place to configure "the late fee" instead
 * of two. This just surfaces the current value here with a shortcut to it.
 */
function RecoveryPolicyNote() {
  const navigate = useNavigate();
  const { data: settings } = useReturnRecoverySettings();

  return (
    <p className="text-xs text-muted-foreground">
      Recovery flagged{" "}
      <span className="font-medium text-foreground">{settings ? settings.max_late_fee_days : "…"} days</span>{" "}
      past return due ·{" "}
      <button type="button" onClick={() => navigate("/billing")} className="underline hover:text-foreground">
        edit
      </button>
    </p>
  );
}

/**
 * Admin-facing view, one tab per stage of the full rental lifecycle:
 *   Payment successful -> Pending (confirmed) -> Admin confirms pickup ->
 *   Active (fulfilled — Plan Status/Renewal columns show past-due/paused/
 *   scheduled-renewal without needing their own tabs) -> rider requests a
 *   return -> Return Requests -> staff review/inspect/settle -> Completed.
 * Distinct from BookingStatus/PickupQueueFilters — "Active" and "Return
 * Requests" are the SAME raw status filtered further, and "All" is
 * deliberately no filter at all, so this can't just be the raw status type.
 *
 * Deliberately few tabs: what used to be split into Due, Scheduled
 * Renewals, Recovery, Settled and Expired tabs is still fully visible —
 * via the Plan Status/Renewal columns on Active, via Status + the
 * per-row Review/View Return action on Return Requests/Completed, or via
 * All + search — just not as separate top-level filters for something
 * that's a variant of an existing stage, not a new one.
 *
 * Return Requests used to live on its own page ("Returns", /returns) —
 * merged in here so the whole lifecycle, booking through settlement, is
 * managed from one place. Only the actual return-processing detail
 * workflow (/bookings/returns/:rentalId — inspection, charges, payment,
 * Complete Return) stays a separate page, nested under /bookings so nav
 * highlighting/matchPath recognise it as part of Rental Operations; every
 * row below still navigates there exactly as it did on the old Returns page.
 */
type RentalOpsView = "pending" | "active" | "return_requests" | "completed" | "cancelled" | "all";

const VIEW_TABS: { value: RentalOpsView; label: string }[] = [
  { value: "pending", label: "Pending Bookings" },
  { value: "active", label: "Active" },
  // Merged in from the old standalone Returns page.
  { value: "return_requests", label: "Return Requests" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function filtersForView(
  view: RentalOpsView,
): Pick<PickupQueueFilters, "status" | "returnRequested"> {
  switch (view) {
    case "pending": return { status: "confirmed" };
    case "active": return { status: "fulfilled" };
    case "return_requests": return { status: "fulfilled", returnRequested: true };
    case "completed": return { status: "completed" };
    case "cancelled": return { status: "cancelled" };
    case "all": return {};
  }
}

export default function BookingListPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  // Kept in the URL, not plain component state — the Return Detail page's
  // back button uses browser history (navigate(-1)), which only restores
  // the tab that was open if that tab is actually part of the URL this page
  // remounts from. A plain useState here would reset to "Pending Bookings"
  // every time an admin came back from reviewing a return, even one opened
  // from Return Requests/Recovery/Settled.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("tab");
  const view: RentalOpsView = VIEW_TABS.some((t) => t.value === rawView) ? (rawView as RentalOpsView) : "pending";
  const setView = (next: RentalOpsView) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("tab", next);
      return params;
    });
  };
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pickupTarget, setPickupTarget] = useState<PickupBooking | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
      className: "text-right tabular-nums",
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
      render: (b) => {
        const { label, tone } = lifecycleStatus(b);
        return <Badge variant={tone}>{label}</Badge>;
      },
    },
    {
      // Separate from the booking's lifecycle status: plan_status is the
      // subscription's billing state (active/past_due/paused), only
      // meaningful once fulfilled (still riding) — null before pickup and
      // after a genuine completion. An independent fact about the same
      // booking, not a variant of its status.
      header: "Plan Status",
      key: "plan_status",
      render: (b) => {
        if (b.plan_status) return <StatusBadge status={b.plan_status} />;
        // A cancelled/expired/completed booking's plan is over — say so
        // rather than showing a bare "—" that reads like "no plan".
        if (b.status === "cancelled" || b.status === "expired" || b.status === "completed") {
          return <Badge variant="muted">Ended</Badge>;
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
    {
      header: "Payment due",
      key: "payment_due",
      render: (b) => {
        if (!b.next_due_at) return "—";
        if (b.plan_status !== "past_due") {
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
      className: "text-right",
      render: (b) => {
        const rentalId = b.active_rental?.id;
        // Checked before "return requested" for the same reason
        // lifecycleStatus() does: return_requested_at is a historical
        // timestamp that never clears, so an already-completed return would
        // otherwise still show the in-progress "Review Return" action
        // instead of a plain link back to its (now read-only) settlement.
        if (b.status === "completed" && rentalId) {
          return (
            <Button size="sm" variant="outline" onClick={() => navigate(`/bookings/returns/${rentalId}`)}>
              View Return
            </Button>
          );
        }
        // A return in progress outranks Confirm Pickup — mutually exclusive
        // in practice anyway, since return_requested_at only ever applies to
        // a fulfilled booking, which can't simultaneously be "confirmed".
        if (b.active_rental?.return_requested_at && rentalId) {
          return (
            <Button size="sm" onClick={() => navigate(`/bookings/returns/${rentalId}`)}>
              Review Return
            </Button>
          );
        }
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

  /** Ported from the old Returns page's "Pending" tab — return-requested rentals awaiting inspection. */
  const returnRequestColumns: DataTableColumn<PickupBooking>[] = [
    { header: "Rider", key: "rider", render: (b) => b.rider.full_name },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (b) => (
        <div>
          <p className="font-medium">{b.vehicle?.registration_number ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{b.vehicle_model?.name ?? "—"}</p>
        </div>
      ),
    },
    {
      header: "Rental started",
      key: "started",
      render: (b) => (b.active_rental ? formatDate(b.active_rental.started_at) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Return requested",
      key: "return_requested",
      render: (b) => (b.active_rental?.return_requested_at ? formatDateTime(b.active_rental.return_requested_at) : "—"),
    },
    {
      header: "Charges",
      key: "charges",
      render: (b) => (b.active_rental?.charges != null ? formatCurrency(b.active_rental.charges) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Amount Due",
      key: "amount_due",
      render: (b) => (
        b.active_rental?.amount_due != null
          ? (b.active_rental.amount_due > 0
            ? <span className="font-semibold text-destructive">{formatCurrency(b.active_rental.amount_due)}</span>
            : <span className="text-muted-foreground">₹0</span>)
          : "—"
      ),
    },
    {
      header: "Payment Status",
      key: "payment_status",
      render: (b) => <StatusBadge status={b.active_rental?.payment_status ?? "not_required"} />,
    },
    { header: "Status", key: "status", render: () => <StatusBadge status="return_requested" /> },
    {
      header: "Actions",
      key: "actions",
      className: "text-right",
      render: (b) => (
        <Button size="sm" onClick={() => b.active_rental && navigate(`/bookings/returns/${b.active_rental.id}`)}>
          Review Return
        </Button>
      ),
    },
  ];

  const columns = view === "cancelled"
    ? cancelledColumns
    : view === "return_requests"
      ? returnRequestColumns
      : baseColumns;

  usePageSubtitle("Manage the full rental lifecycle, from booking to return.");

  return (
    <div className="space-y-4 animate-fade-in">
      <RentalOperationsSummaryCards />

      <Tabs value={view} onValueChange={(v) => { setView(v as RentalOpsView); setPage(1); }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="flex-wrap">
            {VIEW_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {hasAction(user, "bookings", "edit") && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PackageCheck className="h-3.5 w-3.5" /> New Booking
            </Button>
          )}
        </div>
      </Tabs>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search rider, vehicle or ID…"
            className="w-full sm:max-w-xs"
          />
          <RecoveryPolicyNote />
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
                    {
                      onSuccess: () => {
                        toastSuccess("Handover confirmed");
                        setPickupTarget(null);
                      },
                      onError: (err) => toastError(err, "Could not confirm handover"),
                    },
                  );
                }
              }}
            >
              Confirm handover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminCreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
