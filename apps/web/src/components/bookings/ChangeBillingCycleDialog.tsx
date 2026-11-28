import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApplyBillingCycleChange, usePreviewBillingCycleChange } from "@/hooks/useBillingCycle";
import type { BillingCycleChangeResult, BillingCycleCharge, CollectedMethod } from "@/services/api/billingCycle";
import { ApiError } from "@/services/api/httpClient";
import { formatCycleTime } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/toastHelpers";
import { useToastStore } from "@/store/toastStore";
import type { PickupBooking } from "@/types";

type ChargeMode = "charge" | "waive";
type CollectMode = "app" | "counter";

const METHOD_LABEL: Record<CollectedMethod, string> = {
  cash: "Cash", upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet",
};

/** "₹688" / "₹12.50" — whole rupees without decimals. */
function inr(n: number) {
  return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

interface ChargeSectionProps {
  charge: BillingCycleCharge;
  mode: ChargeMode; onMode: (m: ChargeMode) => void;
  collect: CollectMode; onCollect: (c: CollectMode) => void;
  method: CollectedMethod; onMethod: (m: CollectedMethod) => void;
  waiveReason: string; onWaiveReason: (s: string) => void;
}

/**
 * The charge for the extra time, as the server computed it: the rider's own
 * plan rate per started hour, plus any flat change fee. Staff choose to bill
 * it (paid in the app, or collected now) or waive it with a reason.
 */
function ChargeSection({ charge: c, mode, onMode, collect, onCollect, method, onMethod, waiveReason, onWaiveReason }: ChargeSectionProps) {
  if (c.total <= 0) {
    let why = "The time moves earlier, so the rider gets less time — nothing to charge.";
    if (!c.enabled) why = "Charging for billing-cycle changes is turned off in Billing settings.";
    return (
      <div className="rounded-lg border border-border px-3 py-2 text-sm">
        <span className="font-medium">No charge.</span> <span className="text-muted-foreground">{why}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border px-3 py-2.5 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Charge</p>
      {c.time_charge > 0 && (
        <p className="text-xs text-muted-foreground">
          {inr(c.period_price)} plan ÷ {c.plan_days} days = {inr(c.daily_rate)}/day · {inr(c.hourly_rate)}/hour
        </p>
      )}
      {c.billable_days > 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">
            Date +{c.billable_days} day{c.billable_days === 1 ? "" : "s"} × {inr(c.daily_rate)}
          </span>
          <span className="font-medium">{inr(c.day_charge)}</span>
        </div>
      )}
      {c.billable_hours > 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">
            Time later +{c.billable_hours} h × {inr(c.hourly_rate)}
          </span>
          <span className="font-medium">{inr(c.hour_charge)}</span>
        </div>
      )}
      {c.change_fee > 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Change fee</span>
          <span className="font-medium">{inr(c.change_fee)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-border pt-1.5">
        <span className="font-medium">Total (GST included)</span>
        <span className="font-semibold">{inr(c.total)}</span>
      </div>

      <label className="flex items-center gap-2">
        <input type="radio" name="bc-charge" checked={mode === "charge"} onChange={() => onMode("charge")} />
        Charge the rider
      </label>
      {mode === "charge" && (
        <div className="ml-6 space-y-1.5">
          <label className="flex items-center gap-2">
            <input type="radio" name="bc-collect" checked={collect === "app"} onChange={() => onCollect("app")} />
            Rider pays in the app <span className="text-xs text-muted-foreground">(added to Amount Due)</span>
          </label>
          <label className="flex flex-wrap items-center gap-2">
            <input type="radio" name="bc-collect" checked={collect === "counter"} onChange={() => onCollect("counter")} />
            Collected now
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
              value={method} disabled={collect !== "counter"}
              onChange={(e) => onMethod(e.target.value as CollectedMethod)}
            >
              {(Object.keys(METHOD_LABEL) as CollectedMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
          </label>
        </div>
      )}
      <label className="flex items-center gap-2">
        <input type="radio" name="bc-charge" checked={mode === "waive"} onChange={() => onMode("waive")} />
        Waive — changed for our own reasons
      </label>
      {mode === "waive" && (
        <Input
          className="ml-6 w-[calc(100%-1.5rem)]" maxLength={500} value={waiveReason}
          placeholder="Why we're waiving it *"
          onChange={(e) => onWaiveReason(e.target.value)}
        />
      )}
    </div>
  );
}

/** An instant in IST, whatever the admin's own browser zone — "15 Nov 2026, 8:00 PM". */
function fmtIst(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso)).replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

function fmtDay(dateStr: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${dateStr}T00:00:00Z`));
}

function OldNew({ label, before, after }: { label: string; before: string; after: string }) {
  const same = before === after;
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {same ? (
          <span>{after} <span className="text-xs text-muted-foreground">(no change)</span></span>
        ) : (
          <>
            <span className="text-muted-foreground line-through">{before}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{after}</span>
          </>
        )}
      </span>
    </div>
  );
}

interface Props {
  booking: PickupBooking | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin "Change billing cycle". The admin picks a new due date (never
 * earlier) and/or time, PREVIEWS what the server would change, then confirms
 * with a reason. Confirm stays disabled until the preview shown matches the
 * inputs exactly, so nobody applies a change they didn't see.
 */
export function ChangeBillingCycleDialog({ booking, onOpenChange }: Props) {
  const preview = usePreviewBillingCycleChange();
  const apply = useApplyBillingCycleChange();

  const [dueOn, setDueOn] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ key: string; data: BillingCycleChangeResult } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [chargeMode, setChargeMode] = useState<ChargeMode>("charge");
  const [collect, setCollect] = useState<CollectMode>("app");
  const [method, setMethod] = useState<CollectedMethod>("cash");
  const [waiveReason, setWaiveReason] = useState("");

  // Fresh state for every rider the dialog opens on.
  useEffect(() => {
    if (!booking) return;
    setDueOn(booking.next_due_at?.slice(0, 10) ?? "");
    setDueTime((booking.cycle_time ?? "12:00:00").slice(0, 5));
    setReason("");
    setChargeMode("charge");
    setCollect("app");
    setMethod("cash");
    setWaiveReason("");
    setResult(null);
    setPreviewError(null);
    preview.reset();
  }, [booking?.id]); // keyed on the rider, not every re-render of the row object

  if (!booking) return null;

  const key = `${dueOn}|${dueTime}`;
  const previewIsCurrent = result?.key === key;
  const minDate = booking.next_due_at?.slice(0, 10);
  const canPreview = !!dueOn && /^\d{2}:\d{2}$/.test(dueTime) && !preview.isPending;
  const owes = previewIsCurrent && result!.data.charge.total > 0;
  const waiving = owes && chargeMode === "waive";
  const canApply = previewIsCurrent && reason.trim().length >= 3 && !apply.isPending
    && (!waiving || waiveReason.trim().length >= 3);
  let previewLabel = "Preview change";
  if (preview.isPending) previewLabel = "Checking…";
  else if (previewIsCurrent) previewLabel = "Preview again";

  const runPreview = () => {
    setPreviewError(null);
    preview.mutate(
      { bookingId: booking.id, input: { new_due_on: dueOn, new_due_time: dueTime } },
      {
        onSuccess: (data) => setResult({ key, data }),
        onError: (err) => {
          setResult(null);
          setPreviewError(err instanceof ApiError ? err.message : "Couldn't preview the change. Please try again.");
        },
      },
    );
  };

  const runApply = () => {
    apply.mutate(
      {
        bookingId: booking.id,
        input: {
          new_due_on: dueOn,
          new_due_time: dueTime,
          reason: reason.trim(),
          ...(waiving ? { waive_charge: true, waive_reason: waiveReason.trim() } : {}),
          ...(owes && !waiving && collect === "counter" ? { collected_method: method } : {}),
        },
      },
      {
        onSuccess: (data) => {
          const c = data.charge;
          let charged = "";
          if (c.invoice_id) charged = c.collected ? ` · ${inr(c.total)} collected` : ` · ${inr(c.total)} added to the rider's bill`;
          else if (c.waived) charged = " · charge waived";
          toastSuccess(`Billing cycle changed — next payment due ${fmtIst(data.new_due_at)}${charged}`);
          if (c.invoice_id && collect === "counter" && !c.collected) {
            useToastStore.getState().push({
              tone: "error",
              title: "Collection not recorded",
              message: `The change is saved, but ${inr(c.total)} is still owing. Record the payment from Payments.`,
            });
          }
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Couldn't change the billing cycle"),
      },
    );
  };

  const r = previewIsCurrent ? result!.data : null;
  const current = r?.periods.find((p) => p.status === "current");
  const upcoming = r?.periods.filter((p) => p.status === "scheduled") ?? [];

  return (
    <Dialog open={!!booking} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Change billing cycle — {booking.rider.full_name}</DialogTitle>
          <DialogDescription>
            Now: next payment due{" "}
            <span className="font-medium text-foreground">
              {minDate ? fmtDay(minDate) : "—"} · {formatCycleTime(booking.cycle_time)}
            </span>
            . The date can only move later; the time can move either way.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bc-date">New due date</Label>
            <Input id="bc-date" type="date" min={minDate} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-time">New due time (IST)</Label>
            <Input id="bc-time" type="time" step={60} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" disabled={!canPreview} onClick={runPreview}>
            {previewLabel}
          </Button>
        </div>

        {previewError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {previewError}
          </p>
        )}

        {r && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Preview — nothing saved yet
            </p>
            {current && (
              <OldNew label="This period ends" before={fmtIst(current.old_ends_at)} after={fmtIst(current.new_ends_at)} />
            )}
            {upcoming.map((p) => (
              <OldNew
                key={p.sequence_number}
                label={`Period #${p.sequence_number} (paid ahead)`}
                before={`${fmtIst(p.old_starts_at)} – ${fmtIst(p.old_ends_at)}`}
                after={`${fmtIst(p.new_starts_at)} – ${fmtIst(p.new_ends_at)}`}
              />
            ))}
            <OldNew label="Return-by time" before={fmtIst(r.old_due_back_at)} after={fmtIst(r.new_due_back_at)} />
            <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2 py-1.5 text-sm">
              <span className="text-muted-foreground">Extra days</span>
              <span>
                {r.extra_days === 0 ? "None — time only" : <><span className="font-medium">{r.extra_days}</span> (limit {r.max_extra_days})</>}
              </span>
            </div>
            {r.status_before !== r.status_after && (
              <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-2 py-1.5 text-sm">
                <span className="text-muted-foreground">Plan status</span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="destructive">Past due</Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="success">Active</Badge>
                </span>
              </div>
            )}
            {r.clears_recovery_flag && (
              <p className="py-1 text-xs text-muted-foreground">The &ldquo;recovery required&rdquo; flag on this rental will be cleared.</p>
            )}
            {r.invoices_moved > 0 && (
              <p className="py-1 text-xs text-muted-foreground">
                The unpaid next bill&apos;s due date moves by the same {r.extra_days} day{r.extra_days === 1 ? "" : "s"}.
              </p>
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              Prices and payments already made don&apos;t change. The rider gets a notification.
            </p>
          </div>
        )}

        {r && <ChargeSection
          charge={r.charge}
          mode={chargeMode} onMode={setChargeMode}
          collect={collect} onCollect={setCollect}
          method={method} onMethod={setMethod}
          waiveReason={waiveReason} onWaiveReason={setWaiveReason}
        />}

        <div className="space-y-1.5">
          <Label htmlFor="bc-reason">Reason *</Label>
          <Textarea
            id="bc-reason" rows={2} maxLength={500} value={reason}
            placeholder="e.g. Rider gets salary on the 15th"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canApply} onClick={runApply}>
            {apply.isPending ? "Saving…" : "Confirm change"}
          </Button>
        </DialogFooter>
        {!previewIsCurrent && !previewError && (
          <p className="text-right text-xs text-muted-foreground">Preview the change first to enable Confirm.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
