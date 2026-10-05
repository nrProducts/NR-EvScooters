import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueSummary } from "@/services/api/revenue";

function Line({ label, value, negative, total }: { label: string; value: number; negative?: boolean; total?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between py-1.5 text-sm",
      total && "mt-1 border-t border-border pt-2.5 font-semibold",
    )}>
      <span className={cn(total ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular-nums", negative && "text-destructive", total && "text-primary")}>
        {negative && value > 0 ? "−" : ""}{formatCurrency(value)}
      </span>
    </div>
  );
}

/**
 * The money statement: how Gross becomes Net, and — kept visually apart — the
 * security-deposit movements, which are the rider's money and never revenue.
 */
export function FinancialSummaryCard({
  summary,
  isLoading,
}: {
  summary: RevenueSummary | undefined;
  isLoading: boolean;
}) {
  return (
    <MotionCard className="h-full">
      <CardHeader className="p-4 pb-1"><CardTitle className="text-sm">Financial Summary</CardTitle></CardHeader>
      <CardContent className="p-4 pt-1">
        {isLoading || !summary ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <>
            <Line label="Gross Revenue" value={summary.gross} />
            <Line label="Late Fees" value={summary.lateFees} />
            <Line label="Additional Charges" value={summary.additionalCharges} />
            <Line label="Refunds" value={summary.refunds} negative />
            <Line label="Net Revenue" value={summary.net} total />

            <div className="mt-4 rounded-[10px] bg-muted/40 p-3">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Security Deposits
              </p>
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Collected</span>
                  <span className="tabular-nums">{formatCurrency(summary.deposits.collected)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Refunded</span>
                  <span className="tabular-nums">{formatCurrency(summary.deposits.refunded)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Adjusted vs charges</span>
                  <span className="tabular-nums">{formatCurrency(summary.deposits.adjusted)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1 text-xs font-semibold">
                  <span>Currently held</span>
                  <span className="tabular-nums">{formatCurrency(summary.deposits.held)}</span>
                </div>
              </div>
              <p className="mt-2 text-[0.625rem] leading-relaxed text-muted-foreground">
                Deposits are riders&apos; money — never counted as revenue.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </MotionCard>
  );
}
