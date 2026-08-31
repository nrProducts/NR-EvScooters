import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, MapPin, ChevronRight, Navigation, CreditCard, XCircle, Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { KycBanner } from "@/rider/components/KycBanner";
import { CenteredSpinner } from "@/rider/components/common";
import { ScooterStatusCard } from "@/rider/components/scooter";
import {
  useCurrentBooking, useCurrentRental, useReturnStage, useSettlement, useVehicleModels,
} from "@/rider/hooks/queries";
import { useCancelBooking } from "@/rider/hooks/mutations";
import { buildWebMapsUrl } from "@/rider/lib/maps";
import { formatMoney } from "@/rider/constants/status";

function formatDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function RiderHome() {
  const navigate = useNavigate();
  const profile = useRiderAuthStore((s) => s.profile);
  const { data: booking } = useCurrentBooking();
  const { data: rental } = useCurrentRental();
  const { data: stage } = useReturnStage(!!profile?.has_active_rental);
  const { data: settlement } = useSettlement();
  const { data: models, isLoading: modelsLoading } = useVehicleModels({ pageSize: 6 });
  const { cancel, cancelling, previewMessage } = useCancelBooking();
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!profile) return <CenteredSpinner />;

  const firstName = profile.full_name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const pendingBooking =
    profile.has_active_booking && !profile.has_active_rental && booking && booking.status !== "cancelled"
      ? booking
      : null;
  const awaitingPayment = pendingBooking?.status === "pending_payment";

  const handleCancel = async () => {
    if (!pendingBooking) return;
    setConfirmCancel(false);
    const res = await cancel(pendingBooking);
    if (res.ok) toastSuccess("Booking cancelled", res.message);
    else toastError(new Error(res.message), "Could not cancel");
  };

  return (
    <div>
      <h1 className="mb-5 text-center text-lg font-bold">
        {greeting}, {firstName}
      </h1>

      <KycBanner />

      <h2 className="mb-2 text-sm font-semibold">Your Scooter</h2>

      {pendingBooking && (
        <Card className="mb-5">
          <CardContent className="p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-warning">
              {awaitingPayment ? "Payment Pending" : "Pickup Scheduled"}
            </p>
            <p className="mb-2 text-sm font-bold">
              {pendingBooking.vehicle?.registration_number ?? pendingBooking.vehicle_model?.name ?? "Your scooter"}
            </p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> {formatDay(pendingBooking.start_day)}
            </p>
            {pendingBooking.station && (
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {pendingBooking.station.name}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {awaitingPayment
                ? "This booking is not confirmed yet — complete payment to secure it."
                : "Your scooter is reserved — staff will hand it over at pickup."}
            </p>
            <div className="mt-3 space-y-2">
              {awaitingPayment && (
                <Button className="w-full" onClick={() => navigate("/rider/billing")}>
                  <CreditCard className="h-4 w-4" /> Complete Payment
                </Button>
              )}
              {!awaitingPayment && pendingBooking.station && (
                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                >
                  <a href={buildWebMapsUrl(pendingBooking.station.lat, pendingBooking.station.lng)} target="_blank" rel="noreferrer">
                    <Navigation className="h-4 w-4" /> Get Directions
                  </a>
                </Button>
              )}
              <Button variant="ghost" className="w-full text-destructive" onClick={() => setConfirmCancel(true)} disabled={cancelling}>
                <XCircle className="h-4 w-4" /> {cancelling ? "Cancelling…" : "Cancel Booking"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rental && rental.vehicle && (
        <>
          <Card className="mb-5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bike className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-bold">{rental.vehicle.name}</p>
                  <p className="text-xs text-muted-foreground">{rental.vehicle.registration_number}</p>
                </div>
              </div>
              <Button variant="outline" className="mt-3 w-full" onClick={() => navigate("/rider/scooter")}>
                View scooter details
              </Button>
            </CardContent>
          </Card>
          <ScooterStatusCard
            rental={rental}
            settlement={settlement ?? null}
            stage={stage ?? null}
            onRenew={() => navigate("/rider/billing")}
          />
        </>
      )}

      {!pendingBooking && !rental && (
        <Card className="mb-5">
          <CardContent className="p-5 text-center">
            <p className="text-sm font-semibold">Ready to ride?</p>
            <p className="mt-1 text-xs text-muted-foreground">Browse available scooters and book one in minutes.</p>
            <Button className="mt-3 w-full" onClick={() => navigate("/rider/browse")}>Browse scooters</Button>
          </CardContent>
        </Card>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Available Scooters</h2>
        <button className="flex items-center gap-1 text-xs font-bold text-primary" onClick={() => navigate("/rider/browse")}>
          See all <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {modelsLoading ? (
        <CenteredSpinner />
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {(models?.data ?? []).map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/rider/booking/${m.id}`)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="truncate text-xs font-bold">
                    {[m.vendor?.name, m.name].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.starting_price != null ? `from ${formatMoney(m.starting_price)}` : ""}
                    {m.battery_range_km != null ? ` · ${m.battery_range_km} km` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {m.availability.available_count} free
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel booking?"
        description={pendingBooking ? previewMessage(pendingBooking) : ""}
        confirmLabel="Cancel Booking"
        destructive
        onConfirm={handleCancel}
      />
    </div>
  );
}
