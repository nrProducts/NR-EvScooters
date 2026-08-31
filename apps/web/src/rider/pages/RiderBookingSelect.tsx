import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Bike, Clock, AlertTriangle, Check, ChevronLeft, ShieldCheck, CheckCircle2,
  CreditCard, Landmark, Wallet, Smartphone, Lock, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/ErrorState";
import { CenteredSpinner } from "@/rider/components/common";
import { PaymentTrustRow, DealBanner } from "@/rider/components/payment";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { rentGateDecision } from "@/rider/lib/rentGate";
import { useVehicleModel } from "@/rider/hooks/queries";
import { riderApi } from "@/rider/services/riderApi";
import { payOrder } from "@/rider/lib/pay";
import { PaymentCancelledError, PaymentUnavailableError } from "@/rider/lib/razorpayCheckout";
import { ApiError } from "@/services/api/httpClient";
import { getNextBookableDay } from "@/rider/lib/bookingDays";
import { DEFAULT_CANCELLATION_TIERS } from "@/rider/lib/cancellationPolicy";
import { BILLING_CYCLE_LABEL, formatMoney } from "@/rider/constants/status";
import type { ApiPlan } from "@/rider/types/api";

// Backend nearest_station RPC does the real PostGIS distance work; this is the
// "rider's general area" seam, same as the mobile app's placeholder.
const FALLBACK_LOCATION = { lat: 9.9312, lng: 76.2673 };

function useCoords() {
  const [coords, setCoords] = useState(FALLBACK_LOCATION);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { timeout: 5000 },
    );
  }, []);
  return coords;
}

/**
 * Browse -> pick plan -> one "Pay ₹X" tap opens Razorpay Checkout directly
 * (card / UPI / wallet selection happens in that sheet). No separate review
 * screen, no second button.
 */
export default function RiderBookingSelect() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const coords = useCoords();
  const profile = useRiderAuthStore((s) => s.profile);
  const refreshProfile = useRiderAuthStore((s) => s.refreshProfile);
  const { data: model, isLoading, isError, refetch } = useVehicleModel(modelId);

  const { data: station, isLoading: stationLoading } = useQuery({
    queryKey: ["rider", "nearest-station", coords],
    queryFn: () => riderApi.nearestStation(coords.lat, coords.lng),
  });

  const { data: availability } = useQuery({
    queryKey: ["rider", "availability", modelId, station?.id],
    queryFn: () => riderApi.vehicleModelAvailability(modelId as string, station!.id),
    enabled: !!modelId && !!station?.id,
  });

  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const startDay = getNextBookableDay();

  const { data: quote } = useQuery({
    queryKey: ["rider", "plan-quote", plan?.id, startDay],
    queryFn: () => riderApi.quotePlan(plan!.id, startDay),
    enabled: !!plan?.id,
  });

  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  if (isLoading) return <CenteredSpinner />;
  if (isError || !model) return <ErrorState message="This scooter could not be found." onRetry={() => refetch()} />;

  // KYC gate — a rider can't book until their identity is verified (backend
  // enforces this too on POST /bookings + the payment order).
  if (profile && !profile.can_rent) {
    const decision = rentGateDecision(profile.kyc_status);
    const reviewing = profile.kyc_status === "pending" || profile.kyc_status === "partially_verified";
    return (
      <div>
        <BackButton />
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-5 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-warning" />
          <p className="mt-3 text-sm font-bold">{decision.title || "Verify your identity"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {decision.message || "You need a verified identity before renting a scooter."}
          </p>
          {!reviewing && (
            <Button className="mt-4 w-full" onClick={() => navigate("/rider/kyc")}>
              {decision.ctaLabel || "Start KYC"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="flex flex-col items-center px-4 pt-16 text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="text-lg font-bold">Booking Confirmed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Payment successful. Your plan starts now — head to {station?.name ?? "your pickup station"} to collect your{" "}
          {model.name}.
        </p>
        <Button className="mt-8" onClick={() => navigate("/rider", { replace: true })}>Done</Button>
      </div>
    );
  }

  const availableCount = availability?.available_count ?? null;
  const noneAvailable = availableCount === 0;
  const plans = model.plans ?? [];
  const lines = quote?.lines ?? [];
  const total = quote?.amount ?? (plan ? plan.price + plan.deposit_amount : 0);

  const blockedReason = (): string | null => {
    if (!station) return "Finding a pickup station near you…";
    if (noneAvailable) return "No scooters free at this station right now";
    if (plans.length === 0) return "No plans on sale for this scooter";
    if (!plan) return "Choose a rental plan";
    return null;
  };

  const handlePay = async () => {
    if (blockedReason() || !station || !plan) return;
    setPayError(null);
    setPaying(true);
    try {
      // Pay-first: this creates ONLY a payment intent. The booking is created
      // by the backend when the payment captures.
      const order = await riderApi.createBookingOrder({
        vehicle_model_id: model.id,
        station_id: station.id,
        plan_id: plan.id,
        start_day: startDay,
      });
      await payOrder(order, profile, `${plan.name} — rental + deposit`);
      await refreshProfile();
      setPaid(true);
    } catch (err) {
      if (err instanceof PaymentCancelledError) {
        // Nothing was created — a retry just makes a fresh (or reused) intent.
        setPayError("Payment cancelled. Tap Pay to try again.");
      } else if (err instanceof PaymentUnavailableError || err instanceof ApiError) {
        setPayError(err.message);
      } else {
        setPayError("Something went wrong. Please try again.");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <BackButton />
      <h1 className="mb-4 text-lg font-bold">Book {model.name}</h1>

      <Card className="mb-3">
        <CardContent className="flex items-center gap-3 p-4">
          <MapPin className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pickup location</p>
            {stationLoading ? (
              <p className="text-sm">Finding nearest station…</p>
            ) : station ? (
              <p className="text-sm font-bold">{station.name}</p>
            ) : (
              <p className="text-sm text-destructive">No station found nearby</p>
            )}
          </div>
          {station?.distance_km != null && <Badge variant="muted">{station.distance_km.toFixed(1)} km</Badge>}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="flex items-center justify-between p-4">
          <span className="flex items-center gap-2 text-sm font-bold">
            <Bike className="h-4 w-4 text-primary" />
            {availableCount == null ? "Checking availability…" : `${availableCount} available here`}
          </span>
          {availableCount != null && (
            <Badge variant={noneAvailable ? "destructive" : "success"}>
              {noneAvailable ? "Unavailable" : "Available"}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <div>
          <p className="font-bold">Your plan starts right now</p>
          <p className="text-muted-foreground">
            Once you pay, head straight to the pickup station and collect your scooter today. Pickup 8:00 AM – 8:00 PM.
          </p>
        </div>
      </div>

      <h2 className="mb-1 text-sm font-bold">Choose a plan</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {plans.length > 0 ? "Pick how long you want the scooter for." : "No plans are on sale for this scooter yet."}
      </p>
      <div className="space-y-2">
        {plans.map((p) => {
          const selected = plan?.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPlan(p)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border p-4 text-left",
                selected ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <div>
                <p className="text-sm font-bold">{BILLING_CYCLE_LABEL[p.billing_cycle] ?? p.billing_cycle}</p>
                {p.included_minutes != null && (
                  <p className="text-[11px] text-muted-foreground">{p.included_minutes} minutes included</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-primary">{formatMoney(p.price)}</span>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Payment summary + methods — inline once a plan is chosen. */}
      {plan && (
        <div className="mt-6 space-y-3">
          {lines.length > 0 && <DealBanner lines={lines} />}

          {/* Payment Summary */}
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment summary</p>
            {lines.length > 0 ? (
              lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <span className={l.amount < 0 ? "text-success" : "text-muted-foreground"}>{l.description}</span>
                  <span className={cn("font-medium tabular-nums", l.amount < 0 && "text-success")}>
                    {l.amount < 0 ? "-" : ""}
                    {formatMoney(Math.abs(l.amount))}
                  </span>
                </div>
              ))
            ) : (
              <>
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">Rental plan amount</span>
                  <span className="font-medium">{formatMoney(plan.price)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">Security deposit (refundable)</span>
                  <span className="font-medium">{formatMoney(plan.deposit_amount)}</span>
                </div>
              </>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div>
                <p className="text-sm font-bold">{quote ? "Total Payable" : "Estimated Total"}</p>
                {!quote && (
                  <p className="text-[10px] text-muted-foreground">Confirmed on the payment screen</p>
                )}
              </div>
              <span className="text-2xl font-bold text-primary tabular-nums">{formatMoney(total)}</span>
            </div>
          </div>

          {/* Payment method (informational — chosen on Razorpay's secure screen) */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <p className="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Payment method
            </p>
            {[
              { Icon: Smartphone, title: "UPI", subtitle: "GPay · PhonePe · Paytm" },
              { Icon: CreditCard, title: "Cards", subtitle: "Visa · Mastercard · RuPay" },
              { Icon: Landmark, title: "Net Banking", subtitle: "All major banks" },
              { Icon: Wallet, title: "Wallets", subtitle: "Paytm · PhonePe · Mobikwik" },
            ].map(({ Icon, title, subtitle }, i) => (
              <div key={title} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-border")}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-[17px] w-[17px]" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 bg-secondary/40 px-4 py-2.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              Choose on the secure Razorpay screen
            </div>
          </div>

          <PaymentTrustRow className="py-1" />

          <p className="flex items-start gap-2 rounded-lg bg-secondary/40 p-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Cancel within {DEFAULT_CANCELLATION_TIERS[0].upto_minutes} min of booking and{" "}
            {DEFAULT_CANCELLATION_TIERS[0].penalty_percent}% of the plan amount is kept back; the fee rises the longer
            you wait. Your security deposit is always refunded in full.
          </p>
        </div>
      )}

      {payError && <p className="mt-3 text-center text-xs font-medium text-destructive">{payError}</p>}

      {/* Sticky checkout bar */}
      <div
        className="sticky bottom-0 -mx-4 mt-6 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <div className="shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {plan ? "Total Payable" : "Amount"}
          </p>
          <p className="text-lg font-bold tabular-nums">{plan ? formatMoney(total) : "—"}</p>
        </div>
        <Button
          className="h-12 flex-1 text-base font-bold"
          onClick={handlePay}
          disabled={blockedReason() !== null || paying}
        >
          {paying ? "Processing…" : (blockedReason() ?? "Continue")}
          {!paying && !blockedReason() && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function BackButton() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(-1)} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
      <ChevronLeft className="h-4 w-4" /> Back
    </button>
  );
}
