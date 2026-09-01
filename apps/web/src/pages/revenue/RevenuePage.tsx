import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, ChevronDown, Download, PiggyBank, TrendingUp, Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/motion/MotionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/common/SearchBar";
import { FilterBar } from "@/components/common/FilterBar";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { RevenueStatCard } from "@/components/revenue/RevenueStatCard";
import { RevenueTrendChart } from "@/components/revenue/RevenueTrendChart";
import { RevenueSourcesCard } from "@/components/revenue/RevenueSourcesCard";
import { PeriodPicker, type PeriodState } from "@/components/revenue/PeriodPicker";
import {
  useRevenueSummary, useRevenueTrend, useRevenueByType, useRevenueByMethod,
  useRevenueRefunds, useRevenueTransactions,
} from "@/hooks/useRevenue";
import { downloadRevenueExport, type RevenueTransactionRow, type RevenueTxnType } from "@/services/api/revenue";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useTableSort } from "@/hooks/useTableSort";
import { rangeForPreset, rangeForLastDays, previousRange, autoGranularity } from "@/lib/period";
import { toastError } from "@/lib/toastHelpers";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

const TXN_TYPE_LABEL: Record<RevenueTxnType, string> = {
  rental_payment: "Rental Payment",
  renewal_payment: "Renewal Payment",
  late_fee: "Late Fee",
  additional_charge: "Additional Charge",
  damage_charge: "Damage Charge",
  security_deposit: "Security Deposit",
  security_deposit_refund: "Deposit Refund",
  refund: "Refund",
};
const METHOD_LABEL: Record<string, string> = {
  upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", cash: "Cash", other: "Other",
};

/** payment → Paid; refund → its status, mapped to a pill tone. */
function statusPill(r: RevenueTransactionRow) {
  if (r.kind === "payment") return { label: "Paid", variant: "success" as const };
  switch (r.refundStatus) {
    case "succeeded": return { label: "Refunded", variant: "destructive" as const };
    case "failed": return { label: "Failed", variant: "destructive" as const };
    case "rejected": return { label: "Rejected", variant: "muted" as const };
    default: return { label: "Pending", variant: "warning" as const };
  }
}

export default function RevenuePage() {
  usePageSubtitle("Revenue, refunds, deposits and net earnings — from successful transactions.");

  const [period, setPeriod] = useState<PeriodState>(() => ({
    preset: "this_month", range: rangeForPreset("this_month"), granularity: "auto",
  }));
  const [quickKey, setQuickKey] = useState<string | null>(null);
  const [txnType, setTxnType] = useState<string>("all");

  const range = period.range;
  const compare = useMemo(() => previousRange(range), [range]);
  const granularity = period.granularity === "auto" ? autoGranularity(range) : period.granularity;

  const summaryQ = useRevenueSummary(range, compare);
  const trendQ = useRevenueTrend(range, granularity);
  const byTypeQ = useRevenueByType(range);
  const byMethodQ = useRevenueByMethod(range);
  const refundsQ = useRevenueRefunds(range);

  const setRange = (next: PeriodState) => { setPeriod(next); setQuickKey(null); setPage(1); };
  const applyQuick = (days: number, key: string) => {
    setPeriod({ preset: "custom", range: rangeForLastDays(days), granularity: "auto" });
    setQuickKey(key);
    setPage(1);
  };

  // transactions
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all"); // combined payment+refund status
  const [page, setPage] = useState(1);
  const { sort, onSortChange } = useTableSort("date", "desc");

  const txnFilters = {
    from: range.from, to: range.to,
    search: search || undefined,
    type: txnType === "all" ? undefined : (txnType as RevenueTxnType),
    method: method === "all" ? undefined : method,
    paymentStatus: status === "paid" ? "succeeded" : undefined,
    refundStatus: ["refunded", "pending", "failed"].includes(status)
      ? (status === "refunded" ? "succeeded" : status) : undefined,
    page, pageSize: 15,
    sortBy: sort.by as "date" | "gross" | "net",
    sortDir: sort.dir,
  };
  const txnsQ = useRevenueTransactions(txnFilters);

  const doExport = async (format: "csv" | "xlsx") => {
    try { await downloadRevenueExport(txnFilters, format); }
    catch (err) { toastError(err, "Export failed"); }
  };

  const s = summaryQ.data;
  const refundRate = s && s.gross > 0 ? Math.round((s.refunds / s.gross) * 1000) / 10 : 0;

  const money = (n: number, red = false) =>
    n === 0 ? <span className="text-muted-foreground">—</span>
      : <span className={cn("tabular-nums", red && "text-destructive")}>{red ? "−" : ""}{formatCurrency(n)}</span>;

  const txnColumns: DataTableColumn<RevenueTransactionRow>[] = [
    {
      header: "Transaction ID", key: "id",
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground" title={r.id}>
          {r.id.length > 16 ? `${r.id.slice(0, 16)}…` : r.id}
        </span>
      ),
    },
    {
      header: "Booking ID", key: "booking", hideOnMobile: true,
      render: (r) => (r.bookingId ? <span className="font-mono text-xs">{r.bookingId.slice(0, 8)}</span> : "—"),
    },
    { header: "Rider", key: "rider", render: (r) => r.riderName },
    { header: "Vehicle", key: "vehicle", hideOnMobile: true, render: (r) => r.vehicleNumber ?? "—" },
    { header: "Type", key: "type", render: (r) => <span className="text-xs">{TXN_TYPE_LABEL[r.type]}</span> },
    {
      header: "Method", key: "method", hideOnMobile: true,
      render: (r) => (r.method ? METHOD_LABEL[r.method] ?? r.method : "—"),
    },
    {
      header: "Gross", key: "gross", sortKey: "gross", className: "text-right",
      render: (r) => money(r.gross),
    },
    {
      header: "Refund", key: "refund", className: "text-right", hideOnMobile: true,
      render: (r) => money(r.refund, true),
    },
    {
      header: "Deposit", key: "deposit", className: "text-right", hideOnMobile: true,
      render: (r) => (r.deposit ? <span className="tabular-nums text-info">{formatCurrency(r.deposit)}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "Status", key: "status",
      render: (r) => {
        const p = statusPill(r);
        return <Badge variant={p.variant}>{p.label}</Badge>;
      },
    },
    { header: "Date", key: "date", sortKey: "date", render: (r) => formatDateTime(r.date), hideOnMobile: true },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      {/* ── 1. Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Revenue</h1>
          <p className="text-xs text-muted-foreground">
            Track revenue, refunds, deposits and net earnings from successful transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker value={period} onChange={setRange} showGranularity={false} />
          <Select value={txnType} onValueChange={(v) => { setTxnType(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Transaction type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All transactions</SelectItem>
              {(Object.keys(TXN_TYPE_LABEL) as RevenueTxnType[]).map((t) => (
                <SelectItem key={t} value={t}>{TXN_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex">
            <Button size="sm" className="rounded-r-none" onClick={() => void doExport("xlsx")}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="More export formats">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void doExport("xlsx")}>Excel (.xlsx) — formatted</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void doExport("csv")}>CSV — raw data</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── 2. Main revenue — Net is the primary metric ──────────────── */}
      {summaryQ.isLoading || !s ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <MotionCard className="border-primary/20 bg-primary/[0.04]">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Net Revenue</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-primary">{formatCurrency(s.net)}</span>
                {s.deltaPct?.net != null && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                      s.deltaPct.net >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {s.deltaPct.net >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {Math.abs(s.deltaPct.net)}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">Gross Revenue − Completed Refunds</p>
            </div>
            <div className="flex gap-8 sm:border-l sm:border-primary/15 sm:pl-8">
              <div>
                <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">Gross Revenue</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatCurrency(s.gross)}</p>
              </div>
              <div>
                <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">Refunds</p>
                <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", s.refunds > 0 && "text-destructive")}>
                  {s.refunds > 0 ? `−${formatCurrency(s.refunds)}` : formatCurrency(0)}
                </p>
              </div>
            </div>
          </CardContent>
        </MotionCard>
      )}

      {/* ── 3. KPI summary ────────────────────────────────────────────── */}
      {summaryQ.isLoading || !s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[4.5rem]" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RevenueStatCard
            label="Gross Revenue" icon={TrendingUp} tone="success"
            value={s.gross} deltaPct={s.deltaPct?.gross}
            tooltip="Rental + renewal + collected late fees + collected additional charges. Security deposits are never included."
          />
          <RevenueStatCard
            label="Net Revenue" icon={Banknote} tone="success" emphasis
            value={s.net} deltaPct={s.deltaPct?.net}
            tooltip="Gross Revenue − Completed Refunds."
          />
          <RevenueStatCard
            label="Refunds" icon={Undo2} tone="destructive"
            value={s.refunds}
            subtext={`${refundRate}% of revenue`}
            tooltip="Completed refunds that reverse revenue (booking cancellation + goodwill). Pending / failed refunds do not reduce Net Revenue."
          />
          <RevenueStatCard
            label="Deposits Held" icon={PiggyBank} tone="info"
            value={s.deposits.held}
            subtext="Current balance"
            tooltip="Security deposits SwapNgo is currently holding. Riders' money — not revenue."
          />
        </div>
      )}

      {/* ── 3. Revenue analytics ─────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrendChart
            data={trendQ.data} isLoading={trendQ.isLoading}
            activeQuick={quickKey} onQuickRange={applyQuick}
          />
        </div>
        <RevenueSourcesCard rows={byTypeQ.data} isLoading={byTypeQ.isLoading} />
      </div>

      {/* ── 4 + 5. Revenue by type · Payment methods ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Revenue by Type</CardTitle></CardHeader>
          <CardContent className="p-0">
            {byTypeQ.isLoading ? (
              <div className="p-4"><Skeleton className="h-40 w-full" /></div>
            ) : !byTypeQ.data || byTypeQ.data.length <= 1 ? (
              <EmptyState title="No revenue in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-right font-medium">Txns</th>
                      <th className="px-4 py-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byTypeQ.data.map((row) => {
                      const isTotal = row.type === "gross";
                      const neg = row.amount < 0;
                      return (
                        <tr key={row.type} className={cn(isTotal && "bg-primary/[0.04] font-semibold")}>
                          <td className="px-4 py-2">{row.label}</td>
                          <td className={cn("px-4 py-2 text-right tabular-nums", neg && "text-destructive")}>
                            {neg ? `−${formatCurrency(Math.abs(row.amount))}` : formatCurrency(row.amount)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.count}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Payment Methods</CardTitle></CardHeader>
          <CardContent className="p-4 pt-2">
            {byMethodQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !byMethodQ.data || byMethodQ.data.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : (
              (() => {
                const total = byMethodQ.data.reduce((sum, x) => sum + x.amount, 0) || 1;
                return (
                  <div className="space-y-2.5">
                    {byMethodQ.data.map((m) => (
                      <div key={m.method} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{METHOD_LABEL[m.method] ?? m.method}</span>
                          <span className="tabular-nums">
                            <span className="font-medium text-foreground">{formatCurrency(m.amount)}</span>
                            <span className="ml-1.5 text-muted-foreground">{Math.round((m.amount / total) * 100)}%</span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(m.amount / total) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 6. Deposit summary ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
          <CardTitle className="text-sm">Deposit Summary</CardTitle>
          <span className="text-[0.6875rem] text-muted-foreground">Deposits are riders&apos; money — not revenue</span>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          {summaryQ.isLoading || !s ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
              <DepositMetric label="Collected" value={s.deposits.collected} />
              <DepositMetric label="Refunded" value={s.deposits.refunded} />
              <DepositMetric label="Adjusted vs Charges" value={s.deposits.adjusted} />
              <DepositMetric label="Currently Held" value={s.deposits.held} emphasis />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 7. Recent transactions ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-0">
          <CardTitle className="text-sm">Recent Transactions</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/payments">View All <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </CardHeader>
        <FilterBar
          className="border-b-0 pt-2"
          search={
            <SearchBar
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Search transaction, rider, vehicle…"
              className="w-full sm:max-w-xs"
            />
          }
          filters={
            <>
              <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {Object.entries(METHOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
        <div className="border-t border-border">
          <DataTable
            columns={txnColumns}
            data={txnsQ.data?.data ?? []}
            isLoading={txnsQ.isLoading}
            isError={txnsQ.isError}
            onRetry={() => txnsQ.refetch()}
            emptyTitle="No transactions match these filters"
            sort={sort}
            onSortChange={onSortChange}
          />
        </div>
        {txnsQ.data && (
          <Pagination page={page} pageSize={15} total={txnsQ.data.total} onPageChange={setPage} />
        )}
      </Card>

      {/* ── 8. Refund summary ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Refund Summary</CardTitle></CardHeader>
        <CardContent className="p-4 pt-1">
          {refundsQ.isLoading || !refundsQ.data ? (
            <Skeleton className="h-14 w-full" />
          ) : refundsQ.data.count === 0 ? (
            <EmptyState title="No refunds in this period" description="Nothing has been refunded for the selected date range." />
          ) : (
            <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
              <DepositMetric label="Total Refunds" value={refundsQ.data.total} negative />
              <RefundCountMetric label="Refunded Transactions" value={refundsQ.data.count} />
              <DepositMetric label="Pending Refunds" value={refundsQ.data.pending} />
              <RefundCountMetric label="Refund Rate" value={`${refundRate}%`} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DepositMetric({
  label, value, emphasis, negative,
}: { label: string; value: number; emphasis?: boolean; negative?: boolean }) {
  return (
    <div className="px-4 py-2 first:pl-0">
      <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 font-semibold tracking-tight",
        emphasis ? "text-lg text-primary" : "text-base",
        negative && "text-destructive",
      )}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function RefundCountMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-4 py-2 first:pl-0">
      <p className="text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tracking-tight">{value}</p>
    </div>
  );
}
