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

/** One toggleable pricing line resolved from the live billing config. */
interface RuleLine {
  code: string;
  name: string;
  /** Positive = charge (adds), negative = discount (subtracts). */
  amount: number;
}

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
  // Pricing-rule codes the operator switched OFF for this booking.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [amountInput, setAmountInput] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setRiderSearch(""); setRiderId(null); setVehicleId(null); setPlanId(null);
    setStartDay(""); setEndDay(""); setEndTouched(false);
    setRecordPayment(true); setMethod("cash"); setExcluded(new Set());
    setAmountInput(""); setAmountTouched(false); setFormError(null);
  }, [open]);

  // Every ACTIVE global charge / discount rule — nothing hard-coded. The admin
  // gets a checkbox per rule; scoped (plan / model) rules still apply
  // server-side but aren't operator-toggleable per booking.
  const { data: chargeRules } = useChargeRules({ active: true, scope: "all", page: 1, pageSize: 50 });
  const { data: discountRules } = useDiscountRules({ active: true, scope: "all", page: 1, pageSize: 50 });

  const { data: riders } = useUsers({ search: riderSearch || undefined, role: "rider", bookable: true, page: 1, pageSize: 6 });
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

  // Best-effort estimates from the pricing rules, mirroring apply_period_adjustments.
  const ruleLines: RuleLine[] = useMemo(() => {
    if (!plan) return [];
    const days = durationDays || plan.duration_days;
    const globalCharges = (chargeRules?.data ?? []).filter((r) => r.active && r.scope === "global");
    const globalDiscounts = (discountRules?.data ?? []).filter((r) => r.active && r.scope === "global");
    const lines: RuleLine[] = [];
    for (const r of globalCharges) {
      const amt = r.amount_type === "percentage"
        ? Math.round(plan.price * r.amount) / 100
        : r.frequency_type === "per_day" ? r.amount * days : r.amount;
      if (amt > 0) lines.push({ code: r.charge_code, name: r.charge_name, amount: amt });
    }
    for (const r of globalDiscounts) {
      const amt = r.discount_type === "percentage"
        ? Math.round(plan.price * r.value) / 100
        : r.value;
      if (amt > 0) lines.push({ code: r.discount_code, name: r.discount_name, amount: -amt });
    }
    return lines;
  }, [plan, durationDays, chargeRules, discountRules]);

  const appliedLines = ruleLines.filter((l) => !excluded.has(l.code));

  const estimate = plan
    ? Math.max(0, plan.price + plan.deposit_amount + appliedLines.reduce((s, l) => s + l.amount, 0))
    : 0;
  useEffect(() => {
    if (amountTouched) return;
    setAmountInput(estimate ? String(Math.round(estimate * 100) / 100) : "");
  }, [estimate, amountTouched]);

  const toggle = (code: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
    setAmountTouched(false);
  };

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
          exclude_pricing_codes: [...excluded],
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No riders available to book — everyone matching already has an active booking or rental.
                  </p>
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

            {/* One checkbox per live pricing rule — resolved from the billing config, not hard-coded. */}
            {ruleLines.length > 0 ? (
              <div className="space-y-1.5">
                {ruleLines.map((l) => (
                  <label key={l.code} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox" className="h-3.5 w-3.5 accent-primary"
                      checked={!excluded.has(l.code)}
                      onChange={() => toggle(l.code)}
                    />
                    Apply {l.name}
                    <span className={l.amount < 0 ? "text-success" : "text-muted-foreground"}>
                      ({l.amount < 0 ? "−" : "+"}{formatCurrency(Math.abs(l.amount))})
                    </span>
                  </label>
                ))}
              </div>
            ) : plan ? (
              <p className="text-[0.6875rem] text-muted-foreground">No optional charges or discounts configured.</p>
            ) : null}

            {amountInvalid && <p className="text-[0.6875rem] text-destructive">Enter a valid, non-negative amount.</p>}
            <p className="text-[0.6875rem] text-muted-foreground">
              Plan {plan ? formatCurrency(plan.price) : "—"} + deposit {plan ? formatCurrency(plan.deposit_amount) : "—"}
              {appliedLines.filter((l) => l.amount > 0).map((l) => ` + ${l.name.toLowerCase()} ${formatCurrency(l.amount)}`).join("")}
              {appliedLines.filter((l) => l.amount < 0).map((l) => ` − ${l.name.toLowerCase()} ${formatCurrency(Math.abs(l.amount))}`).join("")}
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
