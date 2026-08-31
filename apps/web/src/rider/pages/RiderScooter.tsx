import { useNavigate } from "react-router-dom";
import { Bike, RefreshCw, PackageCheck, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { CenteredSpinner, DetailRow } from "@/rider/components/common";
import { SettlementCard, shouldShowSettlement } from "@/rider/components/scooter";
import { useCurrentBooking, useCurrentRental, useSettlement } from "@/rider/hooks/queries";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { describeExpiry, rentalDayNumber } from "@/rider/lib/rentalTiming";
import { canReturnYet, getRenewalEligibility } from "@/rider/lib/returnPolicy";
import { BILLING_CYCLE_LABEL, RENTAL_STATUS_LABEL, formatDate, formatMoney } from "@/rider/constants/status";

export default function RiderScooter() {
  const navigate = useNavigate();
  const profile = useRiderAuthStore((s) => s.profile);
  const { data: rental, isLoading: rl } = useCurrentRental();
  const { data: booking, isLoading: bl } = useCurrentBooking();
  const { data: settlement } = useSettlement();

  if ((profile?.has_active_rental && rl) || (profile?.has_active_booking && bl)) return <CenteredSpinner />;

  if (rental && rental.vehicle) {
    const expiry = describeExpiry(rental.expires_at);
    const canReturn = canReturnYet(rental.next_due_at);
    const canRenew = getRenewalEligibility(rental.plan_status, rental.next_due_at, rental.renewal_status).canRenew;
    return (
      <div>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bike className="h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-bold">{rental.vehicle.name}</p>
            <Badge variant="info">{RENTAL_STATUS_LABEL[rental.status]}</Badge>
          </div>
        </div>

        {shouldShowSettlement(settlement ?? null) && <SettlementCard settlement={settlement!} />}

        <Card className="mb-5 px-4">
          <DetailRow label="Registration Number" value={rental.vehicle.registration_number} />
          {rental.plan && (
            <DetailRow
              label="Plan"
              value={`${rental.plan.name} · ${formatMoney(rental.plan.price)}/${BILLING_CYCLE_LABEL[rental.plan.billing_cycle]}`}
            />
          )}
          <DetailRow
            label="On rent since"
            value={`${formatDate(rental.started_at)} · Day ${rentalDayNumber(rental.started_at)}`}
          />
          {expiry && <DetailRow label="Renews on" value={expiry.text} />}
          {rental.vehicle.next_service_due_date && (
            <DetailRow label="Next service due" value={formatDate(rental.vehicle.next_service_due_date)} />
          )}
          {rental.station && <DetailRow label="Picked up at" value={rental.station.name} />}
        </Card>

        {rental.return_requested_at ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-bold text-warning">Return requested</p>
            <p className="text-xs text-muted-foreground">
              Your scooter is waiting for staff confirmation. It stays yours until then.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {canRenew && (
              <Button className="w-full" onClick={() => navigate("/rider/billing")}>
                <RefreshCw className="h-4 w-4" /> Renew Plan
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              disabled={!canReturn}
              onClick={() => navigate("/rider/return")}
            >
              <PackageCheck className="h-4 w-4" /> Return Scooter
            </Button>
            {!canReturn && rental.next_due_at && (
              <p className="text-center text-[11px] text-muted-foreground">
                You can return once your current plan period ends on {formatDate(rental.next_due_at)}.
              </p>
            )}
          </div>
        )}

        <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate("/rider/support")}>
          <LifeBuoy className="h-4 w-4" /> Report a problem
        </Button>
      </div>
    );
  }

  if (booking && booking.status !== "cancelled") {
    return (
      <div>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bike className="h-7 w-7" />
          </div>
          <div>
            <p className="text-base font-bold">
              {booking.vehicle?.name ?? booking.vehicle_model?.name ?? "Your scooter"}
            </p>
            <Badge variant="muted">{booking.vehicle ? "Reserved" : "Vehicle not yet assigned"}</Badge>
          </div>
        </div>
        <Card className="px-4">
          {booking.vehicle && <DetailRow label="Registration Number" value={booking.vehicle.registration_number} />}
          {booking.plan && (
            <DetailRow
              label="Plan"
              value={`${booking.plan.name} · ${formatMoney(booking.plan.price)}/${BILLING_CYCLE_LABEL[booking.plan.billing_cycle]}`}
            />
          )}
          {booking.station && <DetailRow label="Pickup station" value={booking.station.name} />}
        </Card>
      </div>
    );
  }

  return (
    <EmptyState
      icon={Bike}
      title="No active rental"
      description="Book a scooter to see it here — once picked up, its details show up on this screen."
    />
  );
}
