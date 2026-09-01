import { Link } from "react-router-dom";
import {
  ArrowRight, Banknote, CalendarRange, Landmark, PiggyBank, RotateCcw, TrendingUp, Undo2, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueStatCard } from "./RevenueStatCard";
import { useRevenueSummary } from "@/hooks/useRevenue";
import { rangeForPreset, previousRange } from "@/lib/period";

/**
 * The dashboard's Revenue Overview: a quick snapshot (this month, vs last
 * month) split into two clearly-separate blocks — Revenue and Deposits —
 * with a shortcut to the full Revenue screen. All figures come from the
 * shared /revenue/summary engine.
 */
export function RevenueOverview() {
  const range = rangeForPreset("this_month");
  const week = rangeForPreset("this_week");
  const year = rangeForPreset("this_year");
  const { data, isLoading } = useRevenueSummary(range, previousRange(range));
  const weekQ = useRevenueSummary(week);
  const yearQ = useRevenueSummary(year);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Revenue</h2>
        <Button asChild size="sm" variant="outline">
          <Link to="/revenue">View Detailed Revenue <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <RevenueStatCard
            label="Weekly Revenue" icon={CalendarRange} tone="info"
            value={weekQ.data?.net ?? 0}
            tooltip="Net revenue for the current week (Mon–today)."
          />
          <RevenueStatCard
            label="Monthly Revenue" icon={CalendarRange} tone="info"
            value={data.net} deltaPct={data.deltaPct?.net} previous={data.previous?.net}
            tooltip="Net revenue this month vs last month."
          />
          <RevenueStatCard
            label="Yearly Revenue" icon={CalendarRange} tone="info"
            value={yearQ.data?.net ?? 0}
            tooltip="Net revenue for the current calendar year."
          />
          <RevenueStatCard
            label="Gross Revenue" icon={TrendingUp} tone="success"
            value={data.gross} deltaPct={data.deltaPct?.gross} previous={data.previous?.gross}
            tooltip="Rental + renewal + collected late fees + collected additional charges. Excludes security deposits."
          />
          <RevenueStatCard
            label="Refunds" icon={Undo2} tone="destructive"
            value={data.refunds} deltaPct={data.deltaPct?.refunds} previous={data.previous?.refunds}
            tooltip="Completed refunds that reverse revenue (booking cancellation + goodwill). Deposit refunds are not counted here."
          />
          <RevenueStatCard
            label="Net Revenue" icon={Banknote} tone="success"
            value={data.net} deltaPct={data.deltaPct?.net} previous={data.previous?.net}
            emphasis
            tooltip="Gross Revenue − Completed Refunds."
          />
        </div>
      )}

      <h2 className="pt-1 text-sm font-semibold text-foreground">Deposits</h2>
      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RevenueStatCard
            label="Deposits Collected" icon={PiggyBank} tone="purple"
            value={data.deposits.collected} deltaPct={data.deltaPct?.depositsCollected}
            previous={data.previous?.deposits.collected}
            tooltip="Security deposits taken this month. Never counted as revenue."
          />
          <RevenueStatCard
            label="Deposits Refunded" icon={RotateCcw} tone="purple"
            value={data.deposits.refunded} previous={data.previous?.deposits.refunded}
            tooltip="Deposit money returned to riders (deposit release + settlement)."
          />
          <RevenueStatCard
            label="Deposits Adjusted" icon={Landmark} tone="warning"
            value={data.deposits.adjusted} previous={data.previous?.deposits.adjusted}
            tooltip="Deposit consumed to cover charges. The charge itself is not counted in Gross Revenue (no separate payment was collected)."
          />
          <RevenueStatCard
            label="Pending Refunds" icon={Wallet} tone="warning"
            value={data.pendingRefunds} currency={false}
            tooltip="Refunds awaiting review or gateway processing. Not yet deducted from Net Revenue."
          />
        </div>
      )}
    </section>
  );
}
