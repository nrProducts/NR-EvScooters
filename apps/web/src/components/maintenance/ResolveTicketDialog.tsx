import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateMaintenanceTicket } from "@/hooks/useMaintenance";
import { ApiError } from "@/services/api/httpClient";
import { cn, formatCurrency } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { MaintenanceTicket } from "@/types";

/** Common parts, so the admin usually taps rather than types. Free text is still allowed. */
const QUICK_PARTS = ["Body panel", "Mirror", "Headlight", "Indicator", "Tyre", "Brake lever", "Battery", "Charger", "Seat"];

const DEFAULT_GST_RATE = 18;

interface DraftItem {
  /** Stable React key — rows can be removed from the middle. */
  key: number;
  part: string;
  amount: string;
}

type PaidVia = "upi" | "cash";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * "Mark resolved" for a maintenance ticket.
 *
 * Resolving on its own is one click. Ticking "Record damaged parts" lets the
 * admin list what broke and what each part costs, add GST, and — when a rider
 * is linked to the ticket — bill them: the charge lands in that rider's app
 * under Billing → Amount Due. If the rider already paid on the spot, UPI or
 * Cash settles it immediately. The parts also go into the vehicle's history.
 *
 * The total shown here is the same sum the server computes (amounts are
 * entered before GST; GST is added on top), so what the admin sees is what the
 * rider is billed.
 */
export function ResolveTicketDialog({
  ticket,
  onOpenChange,
  mode = "resolve",
}: {
  ticket: MaintenanceTicket | null;
  onOpenChange: (open: boolean) => void;
  /**
   * "resolve" closes the ticket (damage optional). "damage" is for a ticket
   * that is ALREADY resolved: damage is the whole point, and nothing about the
   * ticket's status changes.
   */
  mode?: "resolve" | "damage";
}) {
  const update = useUpdateMaintenanceTicket();
  const rider = ticket?.displaced_rider ?? null;

  const [damageTicked, setDamageTicked] = useState(false);
  const damageOnly = mode === "damage";
  const recordDamage = damageOnly || damageTicked;
  const [items, setItems] = useState<DraftItem[]>([{ key: 1, part: "", amount: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [addGst, setAddGst] = useState(false);
  const [gstRate, setGstRate] = useState(String(DEFAULT_GST_RATE));
  const [billRider, setBillRider] = useState(true);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [paidVia, setPaidVia] = useState<PaidVia>("upi");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ticket) return;
    setDamageTicked(false);
    setItems([{ key: 1, part: "", amount: "" }]);
    setNextKey(2);
    setAddGst(false);
    setGstRate(String(DEFAULT_GST_RATE));
    setBillRider(true);
    setAlreadyPaid(false);
    setPaidVia("upi");
    setError(null);
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const billing = recordDamage && !!rider && billRider;
  // With no rider there is nobody to invoice, so the only question left is
  // whether the money was already collected on the spot — it's recorded on
  // the ticket. (A rider who is linked but not billed has no payment to record.)
  const collectingUnbilled = recordDamage && !rider;
  const recordsPayment = (billing && alreadyPaid) || (collectingUnbilled && alreadyPaid);
  const rate = addGst ? Number(gstRate) : 0;
  const rateValid = Number.isFinite(rate) && rate >= 0 && rate <= 100;

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0));
    const gst = rateValid ? round2((subtotal * rate) / 100) : 0;
    return { subtotal, gst, total: round2(subtotal + gst) };
  }, [items, rate, rateValid]);

  const itemsValid = items.every((i) => {
    const amt = Number(i.amount);
    return i.part.trim().length >= 2 && i.amount !== "" && Number.isFinite(amt) && amt >= 0;
  });
  const damageValid = !recordDamage
    || (itemsValid && rateValid && (!(billing || recordsPayment) || totals.subtotal > 0));

  const setItem = (key: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const addRow = (part = "") => {
    setItems((prev) => [...prev, { key: nextKey, part, amount: "" }]);
    setNextKey((k) => k + 1);
  };

  const removeRow = (key: number) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((i) => i.key !== key)));

  /** Tapping a chip fills the first empty row, else adds one. */
  const pickPart = (part: string) => {
    const empty = items.find((i) => !i.part.trim());
    if (empty) setItem(empty.key, { part });
    else addRow(part);
  };

  const submit = () => {
    if (!ticket || !damageValid) return;
    setError(null);
    update.mutate(
      {
        id: ticket.id,
        status: damageOnly ? undefined : "resolved",
        damage: recordDamage
          ? {
              items: items.map((i) => ({ part: i.part.trim(), amount: Number(i.amount) })),
              gst_rate: rate,
              bill_rider: billing,
              paid_via: recordsPayment ? paidVia : undefined,
            }
          : undefined,
      },
      {
        onSuccess: () => {
          const lead = damageOnly ? "Damage added" : "Ticket resolved";
          toastSuccess(
            !billing
              ? recordsPayment
                ? `${lead} — ${formatCurrency(totals.total)} recorded as collected by ${paidVia === "upi" ? "UPI" : "cash"}`
                : recordDamage ? `${lead}${damageOnly ? "" : " and damage recorded"}` : lead
              : alreadyPaid
                ? `${lead} — ${formatCurrency(totals.total)} recorded as paid`
                : `${lead} — ${formatCurrency(totals.total)} billed to ${rider?.full_name ?? "the rider"}`,
          );
          onOpenChange(false);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : damageOnly ? "Could not add the damage." : "Could not resolve this ticket.");
          toastError(err, damageOnly ? "Could not add the damage" : "Could not resolve the ticket");
        },
      },
    );
  };

  const verb = damageOnly ? "Add damage" : "Resolve";
  const submitLabel = !billing
    ? recordsPayment
      ? `${verb} & record ${formatCurrency(totals.total)} paid`
      : damageOnly ? "Save damage" : "Mark resolved"
    : alreadyPaid
      ? `${verb} & record ${formatCurrency(totals.total)} paid`
      : `${verb} & bill ${formatCurrency(totals.total)}`;

  return (
    <Dialog open={!!ticket} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{damageOnly ? "Add damage" : "Mark resolved"} — {ticket?.vehicle?.name}</DialogTitle>
          <DialogDescription>
            {damageOnly
              ? "This ticket is already resolved. Record the damaged parts so they show in the vehicle history, and bill the rider if they should pay."
              : "Closes this ticket and frees the scooter. Record any damaged parts if the rider should pay for them."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {!damageOnly && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox" className="h-4 w-4 accent-primary"
                checked={damageTicked} onChange={(e) => setDamageTicked(e.target.checked)}
              />
              Record damaged parts / charge for damage
            </label>
          )}

          {recordDamage && (
            <>
              {/* Parts */}
              <div className="space-y-2">
                <Label className="text-xs">Damaged parts &amp; amount (₹, before GST)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PARTS.map((p) => (
                    <button
                      key={p} type="button" onClick={() => pickPart(p)}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Input
                        value={item.part} maxLength={80} placeholder="Damaged part"
                        onChange={(e) => setItem(item.key, { part: e.target.value })}
                        aria-label="Damaged part"
                      />
                      <Input
                        type="number" min={0} value={item.amount} placeholder="₹ 0" className="w-28 shrink-0"
                        onChange={(e) => setItem(item.key, { amount: e.target.value })}
                        aria-label="Amount before GST"
                      />
                      <IconButton
                        type="button" variant="ghost" className="shrink-0" label="Remove part"
                        disabled={items.length === 1} onClick={() => removeRow(item.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => addRow()}>
                  <Plus className="h-3.5 w-3.5" /> Add another part
                </Button>
              </div>

              {/* GST + totals */}
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox" className="h-3.5 w-3.5 accent-primary"
                      checked={addGst} onChange={(e) => setAddGst(e.target.checked)}
                    />
                    Add GST
                  </label>
                  {addGst && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number" min={0} max={100} step="0.5" value={gstRate} className="h-8 w-20"
                        onChange={(e) => setGstRate(e.target.value)} aria-label="GST percentage"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  )}
                </div>
                {addGst && !rateValid && (
                  <p className="text-xs text-destructive">Enter a GST rate between 0 and 100.</p>
                )}

                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd>{formatCurrency(totals.subtotal)}</dd>
                  </div>
                  {addGst && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">GST ({rateValid ? rate : 0}%)</dt>
                      <dd>{formatCurrency(totals.gst)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-border pt-1.5 text-sm font-semibold">
                    <dt>Total</dt>
                    <dd>{formatCurrency(totals.total)}</dd>
                  </div>
                </dl>
              </div>

              {/* Billing */}
              {rider ? (
                <div className="space-y-2.5 rounded-lg border border-border p-3">
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-primary"
                      checked={billRider} onChange={(e) => setBillRider(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Bill {rider.full_name}</span>
                      <span className="block text-muted-foreground">
                        The total shows in their app under Billing → Amount Due so they can pay it.
                      </span>
                    </span>
                  </label>

                  {billRider && (
                    <div className="space-y-2 border-t border-border pt-2.5">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox" className="h-3.5 w-3.5 accent-primary"
                          checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)}
                        />
                        Rider already paid (optional)
                      </label>
                      {alreadyPaid && (
                        <div className="flex gap-2">
                          {(["upi", "cash"] as const).map((m) => (
                            <button
                              key={m} type="button" onClick={() => setPaidVia(m)}
                              className={cn(
                                "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-smooth",
                                paidVia === m
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-card-hover",
                              )}
                            >
                              {m === "upi" ? "UPI" : "Cash"}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {alreadyPaid
                          ? `${formatCurrency(totals.total)} is marked collected by ${paidVia === "upi" ? "UPI" : "cash"} — nothing is left for the rider to pay.`
                          : "Leave unticked if the rider still has to pay."}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    No rider is linked to this scooter, so there is nobody to bill in the app. The damaged parts and
                    amount are saved to the vehicle&rsquo;s history.
                  </p>
                  <div className="space-y-2 border-t border-border pt-2.5">
                    <Label className="text-xs">Was the damage amount already paid?</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([["no", "Not paid yet"], ["upi", "Paid via UPI"], ["cash", "Paid in cash"]] as const).map(([value, text]) => {
                        const selected = value === "no" ? !alreadyPaid : alreadyPaid && paidVia === value;
                        return (
                          <button
                            key={value} type="button"
                            onClick={() => {
                              if (value === "no") { setAlreadyPaid(false); return; }
                              setAlreadyPaid(true); setPaidVia(value);
                            }}
                            className={cn(
                              "rounded-lg border px-2 py-1.5 text-xs font-medium transition-smooth",
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-card-hover",
                            )}
                          >
                            {text}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[0.6875rem] text-muted-foreground">
                      {alreadyPaid
                        ? `${formatCurrency(totals.total)} is recorded as collected by ${paidVia === "upi" ? "UPI" : "cash"}.`
                        : "Recorded as not collected. It can still be billed to a rider from their page → Add Charge."}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!damageValid || update.isPending} onClick={submit}>
            {update.isPending && <Spinner className="h-4 w-4" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
