import { ShieldCheck, Zap, BadgePercent, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "../constants/status";
import type { ApiOrderLine } from "../types/api";

/** redBus-style trust strip shown above the pay button. */
export function PaymentTrustRow({ className }: { className?: string }) {
  const items = [
    { icon: ShieldCheck, label: "Secure payment" },
    { icon: Zap, label: "Instant refunds" },
    { icon: Lock, label: "Razorpay protected" },
  ];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center gap-1 text-center">
          <it.icon className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-medium leading-tight text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Green "deal applied" banner — shown when the server quote includes a discount line. */
export function DealBanner({ lines, className }: { lines: ApiOrderLine[]; className?: string }) {
  const saved = lines.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);
  if (saved <= 0) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      <BadgePercent className="h-4 w-4" />
      Deal applied · {formatMoney(saved)} saved
    </div>
  );
}
