import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recordPayment, setRecordPayment] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setDescription(""); setAmount(""); setRecordPayment(false); setMethod("cash"); setError(null);
  }, [open]);

  const amt = Number(amount);
  const valid = description.trim().length >= 2 && Number.isFinite(amt) && amt > 0;

  const submit = () => {
    setError(null);
    if (!valid) return;
    add.mutate(
      {
        user_id: userId,
        description: description.trim(),
        amount: amt,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a charge</DialogTitle>
          <DialogDescription>
            A one-off charge for {riderName} outside their plan. It shows on their bill and Outstanding balance; the
            rider needs to do nothing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label className="text-xs">What is the charge for?</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Replacement key"
              maxLength={200}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDescription(r)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Amount (₹)</Label>
            <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
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
                ? `${valid ? formatCurrency(amt) : "The amount"} is marked collected — the charge is settled immediately.`
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
