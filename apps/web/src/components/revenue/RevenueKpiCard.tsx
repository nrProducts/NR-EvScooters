import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatCurrency } from "@/lib/utils";

type Tone = "primary" | "neutral" | "muted-red" | "info";

const ICON_TONE: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  neutral: "bg-muted text-muted-foreground",
  "muted-red": "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

/**
 * A premium KPI tile: label + icon chip, large amount, and the
 * period-over-period delta with the comparison amount ("vs ₹8,500 last month").
 *
 * `invertDelta` is for metrics where "up" is bad (refunds) — the arrow still
 * points the real direction, but the colour reads as a warning, not a win.
 */
export function RevenueKpiCard({
  label,
  value,
  previous,
  deltaPct,
  compareLabel,
  icon: Icon,
  tone = "primary",
  tooltip,
  invertDelta = false,
  emphasis = false,
}: {
  label: string;
  value: number;
  /** The comparison-period amount. Rendered as "vs ₹X {compareLabel}". */
  previous?: number;
  deltaPct?: number | null;
  compareLabel?: string;
  icon?: LucideIcon;
  tone?: Tone;
  tooltip?: string;
  invertDelta?: boolean;
  emphasis?: boolean;
}) {
  const up = deltaPct != null && deltaPct >= 0;
  const good = deltaPct == null ? null : (invertDelta ? !up : up);
  const cmp = compareLabel?.replace(/^vs\s+/, "") ?? "prev. period";

  return (
    <MotionCard className={cn(emphasis && "border-primary/40 bg-primary/[0.03]")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <span className="truncate">{label}</span>
            {tooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="shrink-0 text-muted-foreground/60 hover:text-foreground">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
              </Tooltip>
            )}
          </span>
          {Icon && (
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", ICON_TONE[tone])}>
              <Icon className="h-4 w-4" strokeWidth={1.75} />
            </div>
          )}
        </div>

        <p className={cn("mt-1.5 font-semibold tracking-tight", emphasis ? "text-2xl" : "text-xl")}>
          {formatCurrency(value)}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.6875rem]">
          {deltaPct != null && (
            <span className={cn("flex items-center font-semibold", good ? "text-primary" : "text-destructive")}>
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(deltaPct)}%
            </span>
          )}
          {previous != null ? (
            <span className="text-muted-foreground">
              vs <span className="font-medium text-foreground/80">{formatCurrency(previous)}</span> {cmp}
            </span>
          ) : (
            <span className="text-muted-foreground">{compareLabel}</span>
          )}
        </div>
      </CardContent>
    </MotionCard>
  );
}
