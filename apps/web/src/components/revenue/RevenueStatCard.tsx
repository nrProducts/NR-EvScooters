import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatCurrency } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "destructive" | "info" | "purple";

const TONE: Record<Tone, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  purple: "bg-[#7C3AED]/10 text-[#7C3AED]",
};

/**
 * A KPI card for money figures — amount + optional period-over-period delta +
 * a tooltip spelling out the calculation. Used on the dashboard Revenue
 * Overview and the Revenue screen's summary.
 */
export function RevenueStatCard({
  label,
  value,
  previous,
  deltaPct,
  icon: Icon,
  tone = "default",
  tooltip,
  emphasis = false,
  currency = true,
  subtext,
}: {
  label: string;
  value: number;
  previous?: number;
  deltaPct?: number | null;
  icon?: LucideIcon;
  tone?: Tone;
  tooltip?: string;
  emphasis?: boolean;
  currency?: boolean;
  /** Small caption under the value (e.g. "0% of revenue", "Current balance"). Replaces the "vs …" text. */
  subtext?: string;
}) {
  const fmt = (n: number) => (currency ? formatCurrency(n) : String(n));
  const dir = deltaPct == null ? null : deltaPct >= 0;
  return (
    <MotionCard className={cn("bg-card", emphasis && "border-primary/40 bg-primary/[0.03]")}>
      <CardContent className="flex items-start justify-between gap-2 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground">
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
          <span className={cn("font-semibold tracking-tight", emphasis ? "text-xl" : "text-lg")}>
            {fmt(value)}
          </span>
          {(deltaPct != null || subtext) && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[0.6875rem] font-medium",
                deltaPct != null ? (dir ? "text-success" : "text-destructive") : "text-muted-foreground",
              )}
            >
              {deltaPct != null && (dir ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
              {deltaPct != null ? `${Math.abs(deltaPct)}%` : ""}
              {subtext && <span className={cn(deltaPct != null && "ml-1 font-normal text-muted-foreground")}>{subtext}</span>}
              {deltaPct != null && previous != null && !subtext && (
                <span className="ml-1 font-normal text-muted-foreground">vs {fmt(previous)}</span>
              )}
            </span>
          )}
        </div>
        {Icon && (
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", TONE[tone])}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
      </CardContent>
    </MotionCard>
  );
}
