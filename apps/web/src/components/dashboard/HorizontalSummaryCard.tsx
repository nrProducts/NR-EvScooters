import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SummaryMetric {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
}

const METRIC_TONE_TEXT: Record<NonNullable<SummaryMetric["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

const ICON_TONE_BG: Record<NonNullable<SummaryMetric["tone"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

/**
 * One compact horizontal row replacing what used to be 3+ separate StatCards
 * — icon, a title, a row of small metrics, and a "View X →" link, all in a
 * single card. Used by AdminDashboardPage's Fleet Overview / Staff
 * Attendance / Leave Management sections so those don't repeat as a 3x3 grid.
 */
export function HorizontalSummaryCard({
  icon: Icon,
  iconTone = "default",
  title,
  metrics,
  primaryMetric,
  linkLabel,
  onLinkClick,
  footer,
  isLoading,
}: {
  icon: LucideIcon;
  iconTone?: SummaryMetric["tone"];
  title: string;
  metrics: SummaryMetric[];
  /** An emphasized lead figure shown before the metric row, e.g. "1 Pending Request". */
  primaryMetric?: string;
  linkLabel: string;
  onLinkClick: () => void;
  /** Optional content rendered below the metric row, e.g. a compact progress bar. */
  footer?: ReactNode;
  isLoading?: boolean;
}) {
  return (
    <MotionCard>
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_TONE_BG[iconTone])}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 self-start px-2 text-xs sm:self-auto" onClick={onLinkClick}>
          {linkLabel} <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="border-t border-border px-3.5 py-3">
        {isLoading ? (
          <Skeleton className="h-6 w-full" />
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {primaryMetric && <span className="text-base font-semibold tracking-tight">{primaryMetric}</span>}
            {metrics.map((m, i) => (
              <div key={m.label} className="flex items-center gap-4">
                {(i > 0 || primaryMetric) && <span className="h-4 w-px bg-border" aria-hidden />}
                <div className="flex items-baseline gap-1.5">
                  <span className={cn("text-sm font-semibold tabular-nums", METRIC_TONE_TEXT[m.tone ?? "default"])}>
                    {m.value}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {!isLoading && footer}
      </div>
    </MotionCard>
  );
}
