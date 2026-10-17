import { CardContent } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import type { RevenueByTypeRow, RevenueSummary } from "@/services/api/revenue";

function money(n: number) {
  return n < 0 ? `−${formatCurrency(Math.abs(n))}` : formatCurrency(n);
}

function Row({
  label, value, count, negative, total, muted,
}: {
  label: string; value: number; count?: number; negative?: boolean; total?: boolean; muted?: boolean;
}) {
  const shown = negative && value > 0 ? -value : value;
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 py-1 text-sm",
      total && "mt-1 border-t border-border pt-2 font-semibold",
    )}>
      <span className={cn(total ? "text-foreground" : "text-muted-foreground", muted && "text-xs")}>
        {label}
        {count != null && count > 0 && <span className="ml-1 text-[0.6875rem] text-muted-foreground/70">×{count}</span>}
      </span>
      <span className={cn("tabular-nums", shown < 0 && "text-destructive", muted && "text-xs")}>{money(shown)}</span>
    </div>
  );
}

/**
 * Every rupee taken in the period, and where it went:
 *   Total Collected = Revenue (plan, onboarding, fees, − discounts) + Security Deposits
 * followed by the money paid back out, so the owner can read the whole
 * picture top to bottom without adding cards together.
 */
export function MoneyCollectedCard({
  summary, byType, isLoading, periodLabel,
}: {
  summary: RevenueSummary | undefined;
  byType: RevenueByTypeRow[] | undefined;
  isLoading: boolean;
  periodLabel: string;
}) {
  if (isLoading || !summary) {
    return <Skeleton className="h-64 w-full" />;
  }

  const typeRows = (byType ?? []).filter((r) => r.type !== "gross");
  const refundsOut = summary.refunds + summary.deposits.refunded;
  const cashInHand = summary.totalCollected - refundsOut;

  return (
    <MotionCard>
      <CardContent className="space-y-4 p-4">
        {/* Headline equation */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total Money Collected · {periodLabel}</p>
            <p className="text-2xl font-semibold tracking-tight">{formatCurrency(summary.totalCollected)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
              Revenue {formatCurrency(summary.gross)}
            </span>
            <span className="text-muted-foreground">+</span>
            <span className="rounded-md bg-info/10 px-2.5 py-1 font-medium text-info">
              Security Deposits {formatCurrency(summary.depositPayments)}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Revenue */}
          <div className="rounded-[10px] border border-border p-3">
            <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-primary">
              Revenue — money we keep
            </p>
            {typeRows.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No revenue in this period.</p>
            ) : (
              typeRows.map((r) => <Row key={r.type} label={r.label} value={r.amount} count={r.count} />)
            )}
            <Row label="Gross Revenue" value={summary.gross} total />
            <Row label="Refunds (cancellation / goodwill)" value={summary.refunds} negative />
            <Row label="Net Revenue" value={summary.net} total />
          </div>

          {/* Deposits */}
          <div className="rounded-[10px] border border-border p-3">
            <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-info">
              Security Deposits — rider money, refundable
            </p>
            <Row label="Taken with payments" value={summary.depositPayments} />
            <Row label="Refunded to riders" value={summary.deposits.refunded} negative />
            <Row label="Used against charges" value={summary.deposits.adjusted} negative />
            <Row label="Currently held (all riders, today)" value={summary.deposits.held} total />
          </div>
        </div>

        {/* Money out → cash in hand */}
        <div className="flex flex-col gap-1 rounded-[10px] bg-muted/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Collected {formatCurrency(summary.totalCollected)} − Refunds paid {formatCurrency(refundsOut)}
            <span className="text-xs"> (revenue {formatCurrency(summary.refunds)} + deposit {formatCurrency(summary.deposits.refunded)})</span>
          </span>
          <span className="font-semibold">
            Net cash in: <span className="tabular-nums text-primary">{money(cashInHand)}</span>
          </span>
        </div>
      </CardContent>
    </MotionCard>
  );
}
