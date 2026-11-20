import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddAdhocCharge } from "@/hooks/usePayments";
import { formatCurrency } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/types";

/** A few common ones, but the admin can type anything. */
const QUICK_REASONS = ["Replacement key", "Replacement lock", "Cleaning fee", "Late-return penalty", "Fine"];

const DEFAULT_GST_RATE = 18;

interface DraftLine {
  /** Stable React key — rows can be removed from the middle. */
  key: number;
  description: string;
  amount: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * A one-off charge on a rider's account. Several lines can go on one bill
 * (e.g. a key and a fine), and GST can be added on top: the total shown here is
 * the same sum the server bills (amounts are entered before GST).
 */
export function AddChargeDialog({
  userId,
  riderName,
  open,
  onOpenChange,
}: {
  userId: string;
  riderName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const add = useAddAdhocCharge();

  const [lines, setLines] = useState<DraftLine[]>([{ key: 1, description: "", amount: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [addGst, setAddGst] = useState(false);
  const [gstRate, setGstRate] = useState(String(DEFAULT_GST_RATE));
  const [recordPayment, setRecordPayment] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setLines([{ key: 1, description: "", amount: "" }]); setNextKey(2);
    setAddGst(false); setGstRate(String(DEFAULT_GST_RATE));
    setRecordPayment(false); setMethod("cash"); setError(null);
  }, [open]);

  const rate = addGst ? Number(gstRate) : 0;
  const rateValid = Number.isFinite(rate) && rate >= 0 && rate <= 100;

  const totals = useMemo(() => {
    const subtotal = round2(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
    const gst = rateValid ? round2((subtotal * rate) / 100) : 0;
    return { subtotal, gst, total: round2(subtotal + gst) };
  }, [lines, rate, rateValid]);

  const linesValid = lines.every((l) => {
    const amt = Number(l.amount);
    return l.description.trim().length >= 2 && l.amount !== "" && Number.isFinite(amt) && amt > 0;
  });
  const valid = linesValid && rateValid && totals.total > 0;

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addRow = (description = "") => {
    setLines((prev) => [...prev, { key: nextKey, description, amount: "" }]);
    setNextKey((k) => k + 1);
  };

  const removeRow = (key: number) =>
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));

  /** Tapping a chip fills the first empty row, else adds one. */
  const pickReason = (reason: string) => {
    const empty = lines.find((l) => !l.description.trim());
    if (empty) setLine(empty.key, { description: reason });
    else addRow(reason);
  };

  const submit = () => {
    setError(null);
    if (!valid) return;
    add.mutate(
      {
        user_id: userId,
        items: lines.map((l) => ({ description: l.description.trim(), amount: Number(l.amount) })),
        gst_rate: rate,
        payment: recordPayment ? { method, status: "paid" } : undefined,
      },
      {
        onSuccess: () => {
          toastSuccess(recordPayment ? "Charge added and recorded as paid" : "Charge added to the rider's account");
          onOpenChange(false);
        },
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : "Could not add the charge.");
          toastError(err, "Could not add the charge");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a charge</DialogTitle>
          <DialogDescription>
            A one-off charge for {riderName} outside their plan. It shows on their bill and Outstanding balance; the
            rider needs to do nothing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label className="text-xs">What is the charge for? (₹, before GST)</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => pickReason(r)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-center gap-2">
                  <Input
                    value={line.description} maxLength={200} placeholder="Reason"
                    onChange={(e) => setLine(line.key, { description: e.target.value })}
                    aria-label="Charge reason"
                  />
                  <Input
                    type="number" min={0} value={line.amount} placeholder="₹ 0" className="w-28 shrink-0"
                    onChange={(e) => setLine(line.key, { amount: e.target.value })}
                    aria-label="Amount before GST"
                  />
                  <IconButton
                    type="button" variant="ghost" className="shrink-0" label="Remove charge"
                    disabled={lines.length === 1} onClick={() => removeRow(line.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={() => addRow()}>
              <Plus className="h-3.5 w-3.5" /> Add another charge
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

          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox" className="h-3.5 w-3.5 accent-primary"
                checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)}
              />
              Record payment now
            </label>
            {recordPayment && (
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
            )}
            <p className="text-[0.6875rem] text-muted-foreground">
              {recordPayment
                ? `${valid ? formatCurrency(totals.total) : "The total"} is marked collected — the charge is settled immediately.`
                : "Leave unticked to bill it now and collect later (Payments → Record payment)."}
            </p>
          </div>

          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid || add.isPending} onClick={submit}>
            {add.isPending ? "Adding…" : recordPayment ? "Add & Record Paid" : "Add Charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
