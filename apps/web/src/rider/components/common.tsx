import type { ReactNode } from "react";
import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/common/Spinner";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { useMyPhotoUrl } from "../hooks/queries";
import type { Tone } from "../constants/status";
import type { ApiOrderLine } from "../types/api";
import { formatMoney } from "../constants/status";

/** Rider avatar — resolves the private photo path to a signed URL. */
export function RiderAvatar({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const hasPhoto = useRiderAuthStore((s) => !!s.profile?.profile_photo_url);
  const { data: url } = useMyPhotoUrl(hasPhoto);
  return (
    <span className={cn("flex items-center justify-center overflow-hidden rounded-full bg-secondary", className)}>
      {hasPhoto && url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className={cn("h-5 w-5 text-muted-foreground", iconClassName)} />
      )}
    </span>
  );
}

const TONE_TO_VARIANT: Record<Tone, "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "muted"> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  neutral: "muted",
  primary: "info",
};

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge variant={TONE_TO_VARIANT[tone]}>{children}</Badge>;
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function PriceBreakdown({
  lines,
  total,
  currency = "INR",
  className,
}: {
  lines: ApiOrderLine[];
  total: number;
  currency?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-secondary/40 p-3 text-sm", className)}>
      {lines.map((l, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <span className={cn("text-muted-foreground", l.amount < 0 && "text-success")}>{l.description}</span>
          <span className={cn("font-medium tabular-nums", l.amount < 0 && "text-success")}>
            {l.amount < 0 ? "-" : ""}
            {formatMoney(Math.abs(l.amount), currency)}
          </span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(total, currency)}</span>
      </div>
    </div>
  );
}

export function CenteredSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Spinner className="h-6 w-6" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">{children}</h2>;
}
