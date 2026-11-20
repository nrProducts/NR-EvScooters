import { formatCurrency, cn } from "@/lib/utils";
import { paymentMethodLabel, type MaintenanceDamageCharge, type MaintenanceDamageItem } from "@/types";

/** One-line state of the bill raised for the damage, e.g. "Paid · UPI" or "Unpaid". */
export function damageChargeStatus(charge: MaintenanceDamageCharge): { label: string; tone: "paid" | "due" | "muted" } {
  // Nobody was billed (no rider linked): it's either collected on the spot or not at all.
  if (!charge.billed_to_rider) {
    return charge.paid_via
      ? { label: `Collected · ${paymentMethodLabel(charge.paid_via)}`, tone: "paid" }
      : { label: "Not collected", tone: "muted" };
  }
  const inv = charge.invoice;
  if (!inv) return { label: "Bill removed", tone: "muted" };
  if (inv.payment_state === "paid") {
    return { label: inv.payment_method ? `Paid · ${paymentMethodLabel(inv.payment_method)}` : "Paid", tone: "paid" };
  }
  if (inv.payment_state === "partial") return { label: "Part paid", tone: "due" };
  return { label: "Unpaid", tone: "due" };
}

/**
 * What broke on a maintenance ticket and what the rider was billed for it.
 * Shown in the vehicle's history, so the next person can see a scooter's repair
 * record without opening each ticket. Renders nothing for a ticket with no
 * damage recorded.
 */
export function MaintenanceDamageSummary({
  items,
  charge,
  className,
}: {
  items: MaintenanceDamageItem[];
  charge: MaintenanceDamageCharge | null;
  className?: string;
}) {
  if (items.length === 0 && !charge) return null;
  const status = charge ? damageChargeStatus(charge) : null;

  return (
    <div className={cn("space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5 text-xs", className)}>
      <p className="font-medium text-foreground">Damaged parts</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={`${item.part}-${i}`} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="font-medium">{item.part}</span>
              {item.notes && <span className="block text-muted-foreground">{item.notes}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatCurrency(item.amount)}</span>
          </li>
        ))}
      </ul>

      {charge && status && (
        <div className="space-y-0.5 border-t border-border pt-1.5">
          {charge.gst_rate > 0 && (
            <>
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span><span className="tabular-nums">{formatCurrency(charge.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST ({charge.gst_rate}%)</span><span className="tabular-nums">{formatCurrency(charge.gst_amount)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between font-semibold">
            <span>{charge.billed_to_rider ? "Billed to rider" : "Damage cost"}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">{formatCurrency(charge.total)}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
                  status.tone === "paid" && "bg-success/15 text-success",
                  status.tone === "due" && "bg-warning/15 text-warning",
                  status.tone === "muted" && "bg-muted text-muted-foreground",
                )}
              >
                {status.label}
              </span>
            </span>
          </div>
          {charge.invoice && (
            <p className="text-[0.6875rem] text-muted-foreground">Invoice {charge.invoice.invoice_number}</p>
          )}
        </div>
      )}
    </div>
  );
}
