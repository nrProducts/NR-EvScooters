import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsers } from "@/hooks/useUsers";
import { usePlans } from "@/hooks/usePlans";
import { useVehicles } from "@/hooks/useVehicles";
import { useChargeRules, useDiscountRules } from "@/hooks/useBilling";
import { useAdminCreateBooking } from "@/hooks/useBookings";
import { formatCurrency, cn } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import { PAYMENT_METHOD_LABEL, type PaymentMethod, type Vehicle } from "@/types";

const VEHICLE_STATUS_LABEL: Record<string, string> = {
  available: "Available",
  reserved: "Booked",
  assigned: "Assigned",
  maintenance: "Maintenance",
  retired: "Retired",
};

/** Only an available scooter can back a new booking. */
const isBookable = (v: Vehicle) => v.status === "available";

export function AdminCreateBookingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useAdminCreateBooking();

  const [riderSearch, setRiderSearch] = useState("");
  const [riderId, setRiderId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [endTouched, setEndTouched] = useState(false);
  const [recordPayment, setRecordPayment] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [applyTxnFee, setApplyTxnFee] = useState(true);
  const [applyWelcome, setApplyWelcome] = useState(true);
  const [amountInput, setAmountInput] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setRiderSearch(""); setRiderId(null); setVehicleId(null); setPlanId(null);
    setStartDay(""); setEndDay(""); setEndTouched(false);
    setRecordPayment(true); setMethod("cash"); setApplyTxnFee(true); setApplyWelcome(true);
    setAmountInput(""); setAmountTouched(false); setFormError(null);
  }, [open]);

  // The live billing config — the fee/discount checkboxes only exist when a
  // matching active pricing rule does.
  const { data: chargeRules } = useChargeRules({ chargeCode: "transaction_fee", active: true, page: 1, pageSize: 5 });
  const { data: discountRules } = useDiscountRules({ discountCode: "welcome_discount", active: true, page: 1, pageSize: 5 });
  const txnFeeRule = chargeRules?.data.find((r) => r.charge_code === "transaction_fee" && r.active) ?? null;
  const welcomeRule = discountRules?.data.find((r) => r.discount_code === "welcome_discount" && r.active) ?? null;

  // Enable each checkbox only when its rule is configured.
  useEffect(() => { if (!txnFeeRule) setApplyTxnFee(false); }, [txnFeeRule]);
  useEffect(() => { if (!welcomeRule) setApplyWelcome(false); }, [welcomeRule]);

  const { data: riders } = useUsers({ search: riderSearch || undefined, role: "rider", page: 1, pageSize: 6 });
  const { data: vehicles } = useVehicles({ status: "available", page: 1, pageSize: 50 });
  const vehicle = useMemo(
    () => vehicles?.data.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );
  const { data: plans } = usePlans({ vehicleModelId: vehicle?.vehicle_model_id, active: true, page: 1, pageSize: 20 });
  const plan = plans?.data.find((p) => p.id === planId) ?? null;

  // Clear a plan that no longer matches the chosen vehicle's model.
  useEffect(() => {
    if (plan && vehicle && plan.vehicle_model_id !== vehicle.vehicle_model_id) setPlanId(null);
  }, [vehicle, plan]);

  // Default end date = start + (plan duration − 1), inclusive. The admin can
  // override it; a manual end date drives a custom duration.
  const addDays = (iso: string, n: number) =>
    new Date(new Date(`${iso}T00:00:00`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  useEffect(() => {
    if (endTouched || !startDay || !plan) return;
    setEndDay(addDays(startDay, plan.duration_days - 1));
  }, [startDay, plan, endTouched]);

  const durationDays = startDay && endDay
    ? Math.round((new Date(`${endDay}T00:00:00`).getTime() - new Date(`${startDay}T00:00:00`).getTime()) / 86_400_000) + 1
    : plan?.duration_days ?? 0;
  const durationInvalid = !!endDay && durationDays < 1;

  // Best-effort estimates from the pricing rules, mirroring generate_period_invoice.
  const feeEstimate = plan && txnFeeRule
    ? (txnFeeRule.amount_type === "percentage"
      ? Math.round(plan.price * txnFeeRule.amount) / 100
      : txnFeeRule.amount)
    : 0;
  const discountEstimate = plan && welcomeRule
    ? (welcomeRule.discount_type === "percentage"
      ? Math.round(plan.price * welcomeRule.value) / 100
      : welcomeRule.value)
    : 0;

  const estimate = plan
    ? Math.max(0, plan.price + plan.deposit_amount
        + (applyTxnFee ? feeEstimate : 0)
        - (applyWelcome ? discountEstimate : 0))
    : 0;
  useEffect(() => {
    if (amountTouched) return;
    setAmountInput(estimate ? String(Math.round(estimate * 100) / 100) : "");
  }, [estimate, amountTouched]);

  const amount = Number(amountInput);
  const amountInvalid = amountInput.trim() !== "" && (!Number.isFinite(amount) || amount < 0);
  const canSubmit = !!riderId && !!vehicle && !!vehicle.hub_id && !!plan && !!startDay
    && !durationInvalid && !amountInvalid && !create.isPending;

  const submit = () => {
    setFormError(null);
    if (!riderId || !vehicle?.hub_id || !plan || !startDay) return;
    create.mutate(
      {
        user_id: riderId,
        vehicle_model_id: vehicle.vehicle_model_id,
        station_id: vehicle.hub_id,
        plan_id: plan.id,
        start_day: startDay,
        duration_days: endDay && durationDays !== plan.duration_days ? durationDays : undefined,
        payment: {
          method,
          status: recordPayment ? "paid" : "pending",
          apply_transaction_fee: applyTxnFee,
          apply_welcome_discount: applyWelcome,
          amount: amountTouched && amountInput.trim() !== "" ? amount : undefined,
        },
      },
      {
        onSuccess: () => {
          toastSuccess(recordPayment ? "Booking created and payment recorded" : "Booking created — awaiting payment");
          onOpenChange(false);
        },
        onError: (err) => {
          setFormError(err instanceof ApiError ? err.message : "Could not create the booking.");
          toastError(err, "Could not create the booking");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>Create a booking for a rider and, if they&apos;ve paid, record it now.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Rider */}
          <div className="space-y-1.5">
            <Label className="text-xs">Rider</Label>
            <Input
              placeholder="Search by name, phone or email…"
              value={riderSearch}
              onChange={(e) => { setRiderSearch(e.target.value); setRiderId(null); }}
            />
            {!riderId && riderSearch.trim().length >= 2 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {(riders?.data ?? []).length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No riders match.</p>
                ) : (
                  riders!.data.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-card-hover"
                      onClick={() => { setRiderId(r.id); setRiderSearch(r.full_name); }}
                    >
                      <span className="font-medium">{r.full_name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{r.phone ?? r.email ?? ""}</span>
                      {r.kyc_status !== "verified" && (
                        <span className="ml-2 text-[0.625rem] font-semibold text-destructive">KYC not verified</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {riderId && <p className="text-xs text-success">Rider selected.</p>}
          </div>

          {/* Vehicle */}
          <div className="space-y-1.5">
            <Label className="text-xs">Vehicle</Label>
            <Select value={vehicleId ?? ""} onValueChange={(v) => { setVehicleId(v); setPlanId(null); }}>
              <SelectTrigger><SelectValue placeholder="Select an available scooter" /></SelectTrigger>
              <SelectContent>
                {(vehicles?.data ?? []).filter(isBookable).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.registration_number} · {v.model} — {VEHICLE_STATUS_LABEL[v.status] ?? v.status}
                  </SelectItem>
                ))}
                {(vehicles?.data ?? []).filter(isBookable).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No available scooters right now.</div>
                )}
              </SelectContent>
            </Select>
            {vehicle && !vehicle.hub_id && (
              <p className="text-xs text-destructive">This scooter isn&apos;t assigned to a station — pick another.</p>
            )}
          </div>

          {/* Plan */}
          <div className="space-y-1.5">
            <Label className="text-xs">Plan</Label>
            <Select value={planId ?? ""} onValueChange={setPlanId} disabled={!vehicle}>
              <SelectTrigger><SelectValue placeholder={vehicle ? "Select a plan" : "Pick a vehicle first"} /></SelectTrigger>
              <SelectContent>
                {(plans?.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatCurrency(p.price)} · {p.duration_days} day{p.duration_days === 1 ? "" : "s"} · deposit {formatCurrency(p.deposit_amount)}
                  </SelectItem>
                ))}
                {vehicle && (plans?.data ?? []).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No active plan for this model.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End date</Label>
              <Input
                type="date"
                min={startDay || undefined}
                value={endDay}
                onChange={(e) => { setEndTouched(true); setEndDay(e.target.value); }}
              />
            </div>
          </div>
          {startDay && endDay && (
            <p className={cn("text-[0.6875rem]", durationInvalid ? "text-destructive" : "text-muted-foreground")}>
              {durationInvalid
                ? "End date must be on or after the start date."
                : `${durationDays} day${durationDays === 1 ? "" : "s"}${
                    plan && durationDays !== plan.duration_days ? ` (plan default: ${plan.duration_days})` : ""
                  }`}
            </p>
          )}

          {/* Payment */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox" className="h-3.5 w-3.5 accent-primary"
                checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)}
              />
              Record payment now (booking is confirmed immediately)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Payment type</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                      <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (₹)</Label>
                <Input
                  type="number" min={0}
                  value={amountInput}
                  onChange={(e) => { setAmountTouched(true); setAmountInput(e.target.value); }}
                  placeholder={estimate ? String(estimate) : ""}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={cn("flex items-center gap-2 text-xs", !txnFeeRule && "opacity-50")}>
                <input
                  type="checkbox" className="h-3.5 w-3.5 accent-primary"
                  disabled={!txnFeeRule}
                  checked={applyTxnFee}
                  onChange={(e) => { setApplyTxnFee(e.target.checked); setAmountTouched(false); }}
                />
                Apply transaction fee
                {txnFeeRule
                  ? <span className="text-muted-foreground">(+{formatCurrency(feeEstimate)})</span>
                  : <span className="text-muted-foreground">(not configured)</span>}
              </label>
              <label className={cn("flex items-center gap-2 text-xs", !welcomeRule && "opacity-50")}>
                <input
                  type="checkbox" className="h-3.5 w-3.5 accent-primary"
                  disabled={!welcomeRule}
                  checked={applyWelcome}
                  onChange={(e) => { setApplyWelcome(e.target.checked); setAmountTouched(false); }}
                />
                Apply welcome discount
                {welcomeRule
                  ? <span className="text-success">(−{formatCurrency(discountEstimate)})</span>
                  : <span className="text-muted-foreground">(not configured)</span>}
              </label>
            </div>

            {amountInvalid && <p className="text-[0.6875rem] text-destructive">Enter a valid, non-negative amount.</p>}
            <p className="text-[0.6875rem] text-muted-foreground">
              Plan {plan ? formatCurrency(plan.price) : "—"} + deposit {plan ? formatCurrency(plan.deposit_amount) : "—"}
              {applyTxnFee && feeEstimate > 0 ? ` + fee ${formatCurrency(feeEstimate)}` : ""}
              {applyWelcome && discountEstimate > 0 ? ` − discount ${formatCurrency(discountEstimate)}` : ""}
              {amountTouched && amountInput.trim() !== ""
                ? `. The invoice total is set to exactly ${formatCurrency(amount || 0)}.`
                : ". Exact figures are resolved from the billing config on confirm."}
            </p>
            <p className={cn("text-[0.6875rem]", recordPayment ? "text-muted-foreground" : "text-warning")}>
              {recordPayment
                ? "Booking Status → Confirmed · Payment Status → Paid"
                : "Booking Status → Awaiting payment · Payment Status → Pending"}
            </p>
          </div>

          {formError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{formError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {create.isPending ? "Creating…" : recordPayment ? "Create & Confirm Booking" : "Create Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
