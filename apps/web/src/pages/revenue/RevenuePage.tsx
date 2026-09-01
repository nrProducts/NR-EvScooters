import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Banknote, ChevronDown, Download, PiggyBank, TrendingUp, Undo2, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { RevenueKpiCard } from "@/components/revenue/RevenueKpiCard";
import { RevenuePerformanceChart } from "@/components/revenue/RevenuePerformanceChart";
import { RevenueVsRefundsChart } from "@/components/revenue/RevenueVsRefundsChart";
import { RevenueDonut } from "@/components/revenue/RevenueDonut";
import { FinancialSummaryCard } from "@/components/revenue/FinancialSummaryCard";
import { PeriodPicker, type PeriodState } from "@/components/revenue/PeriodPicker";
import {
  useRevenueSummary, useRevenueTrend, useRevenueByType, useRevenueByMethod,
  useRevenueTransactions,
} from "@/hooks/useRevenue";
import {
  downloadRevenueExport,
  type RevenueGranularity, type RevenueTransactionRow, type RevenueTxnType,
} from "@/services/api/revenue";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useTableSort } from "@/hooks/useTableSort";
import { rangeForPreset, compareRangeFor, autoGranularity, COMPARE_LABEL } from "@/lib/period";
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

function statusPill(r: RevenueTransactionRow) {
  if (r.kind === "payment") return { label: "Completed", variant: "success" as const };
  switch (r.refundStatus) {
    case "succeeded": return { label: "Refunded", variant: "destructive" as const };
    case "failed": return { label: "Failed", variant: "destructive" as const };
    case "rejected": return { label: "Rejected", variant: "muted" as const };
    default: return { label: "Pending", variant: "warning" as const };
  }
}

export default function RevenuePage() {
  usePageSubtitle("Track revenue, refunds, deposits, rental income and financial performance.");

  const [period, setPeriod] = useState<PeriodState>(() => ({
    preset: "this_month", range: rangeForPreset("this_month"), granularity: "auto",
  }));
  const [txnType, setTxnType] = useState<string>("all");

  const range = period.range;
  const compare = useMemo(() => compareRangeFor(period.preset, range), [period.preset, range]);
  const compareLabel = COMPARE_LABEL[period.preset];
  const granularity: RevenueGranularity =
    period.granularity === "auto" ? autoGranularity(range) : period.granularity;

  const summaryQ = useRevenueSummary(range, compare);
  const trendQ = useRevenueTrend(range, granularity);
  const prevTrendQ = useRevenueTrend(compare, granularity);
  const byTypeQ = useRevenueByType(range);
  const byMethodQ = useRevenueByMethod(range);

  const setRange = (next: PeriodState) => { setPeriod(next); setPage(1); };

  // transactions
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const { sort, onSortChange } = useTableSort("date", "desc");

  const txnFilters = {
    from: range.from, to: range.to,
    search: search || undefined,
    type: txnType === "all" ? undefined : (txnType as RevenueTxnType),
    method: method === "all" ? undefined : method,
    paymentStatus: status === "completed" ? "succeeded" : undefined,
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

  const txnColumns: DataTableColumn<RevenueTransactionRow>[] = [
    {
      header: "Transaction ID", key: "id",
      render: (r) => (
        <span className="font-mono text-xs text-muted-foreground" title={r.id}>
          {r.id.length > 16 ? `${r.id.slice(0, 16)}…` : r.id}
        </span>
      ),
    },
    { header: "Date", key: "date", sortKey: "date", render: (r) => formatDateTime(r.date) },
    { header: "Rider", key: "rider", render: (r) => r.riderName },
    {
      header: "Booking", key: "booking", hideOnMobile: true,
      render: (r) => (r.bookingId ? <span className="font-mono text-xs">{r.bookingId.slice(0, 8)}</span> : "—"),
    },
    { header: "Type", key: "type", render: (r) => <span className="text-xs">{TXN_TYPE_LABEL[r.type]}</span> },
    {
      header: "Method", key: "method", hideOnMobile: true,
      render: (r) => (r.method ? METHOD_LABEL[r.method] ?? r.method : "—"),
    },
    {
      header: "Gross", key: "gross", sortKey: "gross", className: "text-right",
      render: (r) => (r.gross ? <span className="tabular-nums">{formatCurrency(r.gross)}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "Refund", key: "refund", className: "text-right", hideOnMobile: true,
      render: (r) => (r.refund ? <span className="tabular-nums text-destructive">−{formatCurrency(r.refund)}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "Deposit", key: "deposit", className: "text-right", hideOnMobile: true,
      render: (r) => (r.deposit ? <span className="tabular-nums text-info">{formatCurrency(r.deposit)}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      header: "Net", key: "net", sortKey: "net", className: "text-right",
      render: (r) => <span className={cn("tabular-nums font-medium", r.net < 0 && "text-destructive")}>{formatCurrency(r.net)}</span>,
    },
    {
      header: "Status", key: "status",
      render: (r) => {
        const p = statusPill(r);
        return <Badge variant={p.variant}>{p.label}</Badge>;
      },
    },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Revenue Overview</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Track revenue, refunds, deposits, rental income and financial performance.
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
              <Download className="h-3.5 w-3.5" /> Export
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

      {/* ── KPI row ────────────────────────────────────────────────────── */}
      {summaryQ.isLoading || !s ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RevenueKpiCard
            label="Gross Revenue" value={s.gross} previous={s.previous?.gross} deltaPct={s.deltaPct?.gross}
            compareLabel={compareLabel} icon={TrendingUp} tone="primary"
            tooltip="Rental + renewal payments, plus collected late fees and additional charges. Security deposits are never included."
          />
          <RevenueKpiCard
            label="Net Revenue" value={s.net} previous={s.previous?.net} deltaPct={s.deltaPct?.net}
            compareLabel={compareLabel} icon={Banknote} tone="primary" emphasis
            tooltip="Gross Revenue − Completed Refunds. The money SwapNgo actually keeps."
          />
          <RevenueKpiCard
            label="Refunds" value={s.refunds} previous={s.previous?.refunds} deltaPct={s.deltaPct?.refunds}
            compareLabel={compareLabel} icon={Undo2} tone="muted-red" invertDelta
            tooltip="Completed refunds that reverse revenue (booking cancellation + goodwill). Pending and failed refunds do not reduce Net Revenue."
          />
          <RevenueKpiCard
            label="Deposits Held" value={s.deposits.held}
            compareLabel="Rider funds, not revenue" icon={PiggyBank} tone="info"
            tooltip="Security deposits SwapNgo is currently holding. Riders' money — tracked entirely separately from revenue."
          />
        </div>
      )}

      {/* ── Performance chart + financial summary ──────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenuePerformanceChart
            current={trendQ.data}
            previous={prevTrendQ.data}
            total={s?.gross}
            deltaPct={s?.deltaPct?.gross}
            compareLabel={compareLabel}
            granularity={granularity}
            onGranularityChange={(g) => setPeriod({ ...period, granularity: g })}
            isLoading={trendQ.isLoading || summaryQ.isLoading}
          />
        </div>
        <FinancialSummaryCard summary={s} isLoading={summaryQ.isLoading} />
      </div>

      {/* ── Revenue vs refunds + breakdown donut ───────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueVsRefundsChart data={trendQ.data} isLoading={trendQ.isLoading} />
        </div>
        <RevenueDonut rows={byTypeQ.data} isLoading={byTypeQ.isLoading} />
      </div>

      {/* ── Revenue by type · Payment methods ──────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
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
          <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
            <CardTitle className="text-sm">Payment Methods</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {byMethodQ.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !byMethodQ.data || byMethodQ.data.length === 0 ? (
              <EmptyState title="No payments in this period" />
            ) : (
              (() => {
                const total = byMethodQ.data.reduce((sum, x) => sum + x.amount, 0) || 1;
                return (
                  <div className="space-y-3">
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

      {/* ── Transactions ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-0">
          <CardTitle className="text-sm">Revenue Transactions</CardTitle>
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
                  <SelectItem value="completed">Completed</SelectItem>
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
    </div>
  );
}
