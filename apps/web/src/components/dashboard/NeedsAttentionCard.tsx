import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Row {
  label: string;
  count: number;
  /** The colour of the rule beside the row and of its tag while something is waiting. */
  tone: "warning" | "destructive" | "info";
  to: string;
  action: string;
}

const RULE = { warning: "border-l-warning", destructive: "border-l-destructive", info: "border-l-info" } as const;
const TAG = {
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
} as const;

/**
 * What is waiting on staff right now: riders to verify, bikes with a low
 * battery, maintenance in progress — three short lines, each with the count in
 * front. A row with nothing in it goes quiet (grey rule, no tag) rather than
 * disappearing, so the list stays the same shape from day to day. Each row opens
 * the screen that clears it.
 */
export function NeedsAttentionCard({
  pendingKyc, lowBattery, pendingMaintenance, isLoading, className,
}: {
  pendingKyc: number;
  lowBattery: number;
  pendingMaintenance: number;
  isLoading?: boolean;
  className?: string;
}) {
  const rows: Row[] = [
    { label: "riders pending KYC", count: pendingKyc, tone: "warning", to: "/kyc", action: "Review" },
    { label: "bikes with low battery", count: lowBattery, tone: "destructive", to: "/live-map", action: "Check" },
    { label: "maintenance open", count: pendingMaintenance, tone: "info", to: "/maintenance", action: "View" },
  ];
  const waiting = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Needs attention</h3>
        {!isLoading ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
              waiting > 0 ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary",
            )}
          >
            {waiting > 0 ? `${waiting} waiting` : "All clear"}
          </span>
        ) : null}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.label}>
              <Link
                to={r.to}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-r-lg border-l-[3px] py-1.5 pl-3 pr-1 text-[0.8125rem] outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
                  r.count > 0 ? RULE[r.tone] : "border-l-border",
                )}
              >
                <span className={cn("min-w-0 truncate", r.count === 0 && "text-muted-foreground")}>
                  <span className="font-semibold tabular-nums">{r.count}</span> {r.label}
                </span>
                {r.count > 0 ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold", TAG[r.tone])}>{r.action}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
