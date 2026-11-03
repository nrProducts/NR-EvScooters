import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, CreditCard, Download, FileWarning, Landmark,
  RefreshCw, Upload, Wallet, XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { Pagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { SideDrawer } from "@/components/common/SideDrawer";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { Spinner } from "@/components/common/Spinner";
import {
  useBankLines, useCashBook, useCategoriseBankLine, useExceptions, useImportBankStatement, useReconciliation,
  useRecoverPayment, useResolveException, useSettlementSummary, useStatement, useStatements, useSyncSettlements,
  useTieOut,
} from "@/hooks/useReconciliation";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import {
  downloadSettlementExport, previewBankStatement,
  type BankImportPreview, type ExceptionRow, type StatementLineRow, type StatementRow,
} from "@/services/api/reconciliation";

/** The GST registration month — nothing before it is reconciled here. */
const FIRST_MONTH = "2026-09";

const EXCEPTION_INFO: Record<string, { title: string; hint: string }> = {
  E1: { title: "Settled, not in our records", hint: "Razorpay paid out a payment we never applied — a late UPI success or a lost webhook. Recover it to apply it to the rider's bill." },
  E2: { title: "Ours, not settled", hint: "Captured more than 3 days ago and in no Razorpay settlement yet. Check the payment in the Razorpay dashboard." },
  E3: { title: "Refund on one side only", hint: "A refund recorded by us or deducted by Razorpay that the other side does not have." },
  E4: { title: "Amount differs", hint: "The same payment or refund id with a different amount on each side." },
  E5: { title: "Adjustment or dispute", hint: "Razorpay adjustment, chargeback or transfer line — classify it and note what it was." },
  E8: { title: "On hold", hint: "Razorpay is holding this line, usually for a risk review." },
  B2: { title: "Bank credit, no settlement", hint: "A Razorpay-looking credit whose UTR matches no synced settlement. Sync Razorpay for those dates." },
  B3: { title: "Settlement amount differs", hint: "The bank received a different amount from what Razorpay settled under that UTR." },
  B9: { title: "Rider paid the bank directly", hint: "Money credited outside Razorpay with no offline payment recorded in admin — record it against the rider's bill so its tax invoice is issued." },
  B10: { title: "Transfer to a rider, no refund", hint: "A bank transfer to a rider with no refund recorded — record the refund so its credit note is issued." },
};

const CATEGORY_LABEL: Record<string, string> = {
  razorpay_settlement: "Razorpay settlement", rider_payment_direct: "Rider payment (direct)",
  upi_qr_settlement: "UPI QR settlement", cash_deposit: "Cash deposit", partner_capital: "Partner capital",
  loan_received: "Loan received", other_income: "Other income", vendor_refund: "Refund from vendor",
  own_transfer_in: "Transfer from own account",
  vehicle_purchase: "Vehicle & battery purchase", battery_swap_partner: "Battery-swap partner",
  repairs_spares: "Repairs & spares", insurance: "Insurance", rent: "Rent", utilities: "Utilities",
  software_telematics: "Software, telematics & SMS", salaries: "Salaries & staff", gst_payment: "GST payment",
  tds_payment: "TDS payment", income_tax: "Income tax", rider_refund: "Rider refund (transfer)",
  partner_drawings: "Partner drawings", loan_repayment: "Loan repayment", bank_charges: "Bank charges",
  own_transfer_out: "Transfer to own account", other_expense: "Other expense",
};
const MONEY_IN = ["razorpay_settlement", "rider_payment_direct", "upi_qr_settlement", "cash_deposit", "partner_capital", "loan_received", "other_income", "vendor_refund", "own_transfer_in"];
const MONEY_OUT = ["vehicle_purchase", "battery_swap_partner", "repairs_spares", "insurance", "rent", "utilities", "software_telematics", "salaries", "gst_payment", "tds_payment", "income_tax", "rider_refund", "partner_drawings", "loan_repayment", "bank_charges", "own_transfer_out", "other_expense"];

function monthsSince(first: string, now = new Date()): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
}
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));

/**
 * Reconciliation — money in, followed from rider to bank.
 *
 * Settlements: Razorpay's own report of each payout, line by line (fee, fee
 * GST, UTR), matched to our payments and refunds. Bank: the HDFC export,
 * where a Razorpay credit is matched to its settlement by UTR and every
 * other line gets a category. Exceptions: whatever did not match, for a
 * person to resolve. Live check: the original side-by-side with Razorpay.
 */
export default function ReconciliationPage() {
  usePageSubtitle("Razorpay settlements and the HDFC bank statement, matched line by line to riders, bills and tax invoices.");
  const user = useAuthStore((s) => s.user);
  const canResolve = hasAction(user, "reconciliation", "resolve");

  const months = useMemo(() => monthsSince(FIRST_MONTH), []);
  const [month, setMonth] = useState(months[0]);

  return (
    <div className="animate-fade-in space-y-4">
      <Tabs defaultValue="settlements">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="flex-wrap">
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="bank">Bank</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="live">Live check</TabsTrigger>
          </TabsList>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="settlements" className="space-y-4">
          <SettlementsTab month={month} canResolve={canResolve} />
        </TabsContent>
        <TabsContent value="bank" className="space-y-4">
          <BankTab month={month} canResolve={canResolve} />
        </TabsContent>
        <TabsContent value="exceptions" className="space-y-4">
          <ExceptionsTab canResolve={canResolve} />
        </TabsContent>
        <TabsContent value="live">
          <LiveCheckTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

function SettlementsTab({ month, canResolve }: { month: string; canResolve: boolean }) {
  const { from, to } = monthRange(month);
  const summary = useSettlementSummary(month);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useStatements({ source: "razorpay", from, to, page, pageSize: 15 });
  const sync = useSyncSettlements();
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setPage(1); }, [month]);

  const s = summary.data;
  const today = new Date().toISOString().slice(0, 10);

  const columns: DataTableColumn<StatementRow>[] = [
    { header: "Date", key: "statementDate", render: (r) => formatDate(r.statementDate) },
    {
      header: "Settlement", key: "externalRef",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{r.externalRef}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{r.utr ?? "No UTR yet"}</p>
        </div>
      ),
    },
    { header: "Payments", key: "grossAmount", className: "text-right", hideOnMobile: true, render: (r) => <Money value={r.grossAmount} /> },
    { header: "Refunds", key: "refundAmount", className: "text-right", hideOnMobile: true, render: (r) => (r.refundAmount ? <Money value={-r.refundAmount} /> : <Dash />) },
    { header: "Fee + GST", key: "feeAmount", className: "text-right", hideOnMobile: true, render: (r) => <Money value={-r.feeAmount} /> },
    { header: "Settled", key: "netAmount", className: "text-right", render: (r) => <Money value={r.netAmount} strong /> },
    {
      header: "Status", key: "status",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.status === "balanced" ? <Badge variant="success">Matched</Badge> : <Badge variant="warning">{r.openExceptions || "!"} to check</Badge>}
          {r.bankMatched && <Badge variant="info">In bank</Badge>}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canResolve && (
          <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate({ from, to: to < today ? to : today })}>
            {sync.isPending ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync {monthLabel(month)}
          </Button>
        )}
        <Button
          size="sm" disabled={exporting}
          onClick={() => {
            setExporting(true);
            downloadSettlementExport(month).catch((e) => toastError(e, "Export failed")).finally(() => setExporting(false));
          }}
        >
          {exporting ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Razorpay statement
        </Button>
      </div>

      {summary.isError ? <ErrorState onRetry={() => summary.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard label="Captured" value={s ? formatCurrency(s.captured) : "—"} icon={CreditCard} />
            <StatCard label="Refunded" value={s ? formatCurrency(s.refunded) : "—"} tone="warning" />
            <StatCard label="Fees (excl. GST)" value={s ? formatCurrency(s.fees) : "—"} tone="destructive" />
            <StatCard label="GST on fees (ITC)" value={s ? formatCurrency(s.feeGst) : "—"} tone="info" />
            <StatCard label="Settled to bank" value={s ? formatCurrency(s.settled) : "—"} icon={Landmark} tone="success" />
            <StatCard label="In transit at month-end" value={s ? formatCurrency(s.inTransitAtEnd) : "—"} icon={Wallet} tone="purple" />
          </div>
          {s && (
            <p className="text-xs text-muted-foreground">
              {s.settlementCount} settlement{s.settlementCount === 1 ? "" : "s"} · {s.capturedCount} payment{s.capturedCount === 1 ? "" : "s"} captured
              {s.inTransitCount > 0 && ` · ${s.inTransitCount} captured by month-end but not yet paid out`}
              {s.syncedSince ? ` · synced from ${formatDate(s.syncedSince)}` : " · not synced yet — run a sync to read Razorpay's settlements"}
              {s.openExceptions > 0 && ` · ${s.openExceptions} open exception${s.openExceptions === 1 ? "" : "s"}`}
            </p>
          )}
        </>
      )}

      <Card className="flex min-h-[16rem] flex-col overflow-hidden">
        <DataTable
          fill
          columns={columns}
          data={list.data?.data ?? []}
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={() => list.refetch()}
          onRowClick={(r) => setSelected(r.id)}
          emptyTitle="No settlements"
          emptyDescription={canResolve ? "Nothing synced for this month yet. Use Sync to read Razorpay." : "Nothing synced for this month yet."}
        />
        {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={setPage} />}
      </Card>

      <StatementDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function StatementDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useStatement(id);
  if (!id) return null;
  return (
    <SideDrawer open={!!id} onOpenChange={(o) => !o && onClose()} title={data?.externalRef ?? "Settlement"} className="sm:max-w-2xl">
      {isLoading || !data ? <p className="mt-4 text-sm text-muted-foreground">Loading...</p> : (
        <div className="mt-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label="Date" value={formatDate(data.statementDate)} />
            <Fact label="UTR" value={data.utr ?? "—"} mono />
            <Fact label="Lines" value={String(data.lineCount)} />
          </div>
          <div className="rounded-md border border-border p-3 font-mono text-xs tabular-nums">
            <Equation label="Payments" value={data.grossAmount} />
            <Equation label="− Refunds" value={-data.refundAmount} />
            <Equation label="− Fee (excl. GST)" value={-(data.feeAmount - data.taxAmount)} />
            <Equation label="− GST on fee" value={-data.taxAmount} />
            <div className="mt-1 border-t border-border pt-1"><Equation label="= Settled" value={data.netAmount} strong /></div>
            {data.statusNote && <p className="mt-2 font-sans text-destructive">{data.statusNote}</p>}
          </div>
          <LinesTable lines={data.lines} />
        </div>
      )}
    </SideDrawer>
  );
}

function LinesTable({ lines }: { lines: StatementLineRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            {["Type", "Razorpay id", "Rider", "Amount", "Fee", "Net", "Match"].map((h) => (
              <th key={h} className={cn("px-3 py-2 font-medium text-muted-foreground", ["Amount", "Fee", "Net"].includes(h) ? "text-right" : "text-left")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-3 py-2 capitalize">{l.kind}</td>
              <td className="px-3 py-2 font-mono">{l.externalId}</td>
              <td className="px-3 py-2">{l.riderName ?? <Dash />}{l.billNumber && <span className="block font-mono text-muted-foreground">{l.billNumber}</span>}</td>
              <td className="px-3 py-2 text-right"><Money value={l.amount} /></td>
              <td className="px-3 py-2 text-right">{l.fee ? <Money value={-l.fee} /> : <Dash />}</td>
              <td className="px-3 py-2 text-right"><Money value={l.netAmount} /></td>
              <td className="px-3 py-2"><MatchBadge line={l} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

function BankTab({ month, canResolve }: { month: string; canResolve: boolean }) {
  const { from, to } = monthRange(month);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "uncategorised" | "exceptions">("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StatementLineRow | null>(null);

  useEffect(() => { setPage(1); }, [month]);

  const lines = useBankLines({
    from, to, filter, category: category === "all" ? undefined : category, search: search.trim() || undefined, page, pageSize: 15,
  });

  const columns: DataTableColumn<StatementLineRow>[] = [
    { header: "Date", key: "valueDate", render: (l) => (l.valueDate ? formatDate(l.valueDate) : <Dash />) },
    {
      header: "Narration", key: "description",
      render: (l) => (
        <div className="min-w-0 max-w-[22rem]">
          <p className="truncate text-xs" title={l.description ?? ""}>{l.description}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{l.counterpartyKey}</p>
        </div>
      ),
    },
    {
      header: "Amount", key: "amount", className: "text-right",
      render: (l) => (
        <span className={cn("inline-flex items-center gap-1 tabular-nums font-medium", l.amount < 0 ? "text-destructive" : "text-success")}>
          {l.amount < 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
          {formatCurrency(Math.abs(l.amount))}
        </span>
      ),
    },
    {
      header: "Category", key: "category",
      render: (l) => l.category ? (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{CATEGORY_LABEL[l.category] ?? l.category}</p>
          <p className="text-xs text-muted-foreground">{l.categorySource === "learned" ? "Learned" : l.categorySource === "auto" ? "Automatic" : "Set by staff"}</p>
        </div>
      ) : <Badge variant="warning">Uncategorised</Badge>,
    },
    { header: "Match", key: "match", hideOnMobile: true, render: (l) => <MatchBadge line={l} /> },
    {
      header: "", key: "edit", className: "text-right",
      render: (l) => canResolve && l.matchStatus !== "resolved" && l.matchStatus !== "ignored" ? (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(l); }}>Categorise</Button>
      ) : null,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canResolve && (
          <Button size="sm" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5" /> Import HDFC statement</Button>
        )}
      </div>

      <TieOutCard month={month} />

      <Card className="flex min-h-[18rem] flex-col overflow-hidden">
        <FilterBar
          search={<SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search narration, reference, counterparty" className="w-full sm:w-80" />}
          filters={
            <>
              <Select value={filter} onValueChange={(v) => { setFilter(v as typeof filter); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All lines</SelectItem>
                  <SelectItem value="uncategorised">Uncategorised</SelectItem>
                  <SelectItem value="exceptions">Exceptions</SelectItem>
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any category</SelectItem>
                  <CategoryOptions />
                </SelectContent>
              </Select>
            </>
          }
        />
        <DataTable
          fill
          columns={columns}
          data={lines.data?.data ?? []}
          isLoading={lines.isLoading}
          isError={lines.isError}
          onRetry={() => lines.refetch()}
          emptyTitle="No bank lines"
          emptyDescription="Import the month's HDFC statement to see its lines here."
        />
        {lines.data && <Pagination page={lines.data.page} pageSize={lines.data.pageSize} total={lines.data.total} onPageChange={setPage} />}
      </Card>

      <CashBookCard month={month} />

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <CategoriseDialog line={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CategoryOptions({ only }: { only?: "in" | "out" }) {
  return (
    <>
      {only !== "out" && MONEY_IN.map((c) => (
        <SelectItem key={c} value={c}>{only ? "" : "In · "}{CATEGORY_LABEL[c]}</SelectItem>
      ))}
      {only !== "in" && MONEY_OUT.map((c) => (
        <SelectItem key={c} value={c}>{only ? "" : "Out · "}{CATEGORY_LABEL[c]}</SelectItem>
      ))}
    </>
  );
}

function TieOutCard({ month }: { month: string }) {
  const { data, isLoading, isError, refetch } = useTieOut(month);
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return null;
  const tied = Math.abs(data.difference) < 0.01 && data.notReceived.length === 0;
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Razorpay → HDFC tie-out</h3>
          <p className="text-xs text-muted-foreground">
            What Razorpay settled this month against what the imported HDFC statement received.
            {data.bankCoveredUntil ? ` Bank imported up to ${formatDate(data.bankCoveredUntil)}.` : " No bank statement imported yet."}
          </p>
        </div>
        {tied
          ? <Badge variant="success" className="self-start"><CheckCircle2 className="mr-1 h-3 w-3" /> Tied</Badge>
          : <Badge variant="warning" className="self-start">Difference {formatCurrency(data.difference)}</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label={`Settled by Razorpay (${data.settlementCount})`} value={formatCurrency(data.settledByRazorpay)} />
        <Fact label={`Received in HDFC (${data.receivedCount})`} value={formatCurrency(data.receivedInBank)} />
        <Fact label="Uncategorised lines" value={String(data.uncategorisedLines)} />
        <Fact label="Open bank exceptions" value={String(data.openBankExceptions)} />
      </dl>
      {data.notReceived.length > 0 && (
        <div className="mt-3 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          <p className="font-medium">Settled but not found in the bank (B1):</p>
          {data.notReceived.map((n) => (
            <p key={n.statementId} className="font-mono">{formatDate(n.date)} · {n.settlementId} · {n.utr ?? "no UTR"} · {formatCurrency(n.amount)}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

function CashBookCard({ month }: { month: string }) {
  const { data, isLoading } = useCashBook(month);
  if (isLoading || !data) return null;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cash book</h3>
          <p className="text-xs text-muted-foreground">Cash recorded at hubs against cash deposits found in the bank.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">In hand {formatCurrency(data.inHand)}</span>
          {data.oldestUndepositedDays > 3 && <Badge variant="warning">Undeposited {data.oldestUndepositedDays} days</Badge>}
        </div>
      </div>
      {data.days.length === 0 ? (
        <EmptyState title="No cash this month" description="No cash payments recorded and no cash deposits imported." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>{["Date", "Collected", "Deposited", "In hand"].map((h, i) => (
                <th key={h} className={cn("px-4 py-2 font-medium text-muted-foreground", i ? "text-right" : "text-left")}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {data.openingInHand !== 0 && (
                <tr className="border-t border-border text-muted-foreground">
                  <td className="px-4 py-2">Brought forward</td><td /><td />
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(data.openingInHand)}</td>
                </tr>
              )}
              {data.days.map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className="px-4 py-2">{formatDate(d.date)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.collected ? formatCurrency(d.collected) : <Dash />}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{d.deposited ? formatCurrency(d.deposited) : <Dash />}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{formatCurrency(d.inHand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BankImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const importer = useImportBankStatement();

  useEffect(() => {
    if (open) { setFile(null); setPreview(null); setPreviewError(null); setConfirmAccount(false); importer.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    setPreviewError(null);
    if (!f) return;
    setPreviewing(true);
    try {
      setPreview(await previewBankStatement(f));
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "The file could not be read.");
    } finally {
      setPreviewing(false);
    }
  };

  const canImport = !!file && !!preview && !preview.blocked && preview.newLines > 0 && (!preview.newAccount || confirmAccount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Import HDFC statement</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Upload the statement exactly as NetBanking exports it (.xls, .xlsx, .csv or .txt). Nothing is saved unless every check passes, and lines already imported are skipped.
          </p>
          <input
            ref={fileRef} type="file" accept=".xls,.xlsx,.csv,.txt" className="hidden"
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {file ? file.name : "Choose statement file"}
          </Button>

          {previewing && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="h-4 w-4" /> Reading and checking...</p>}
          {previewError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{previewError}</p>}

          {preview && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <Fact label="Account" value={preview.accountRef ? `ending ${preview.accountRef}` : "—"} />
                <Fact label="Period" value={preview.periodFrom && preview.periodTo ? `${formatDate(preview.periodFrom)} – ${formatDate(preview.periodTo)}` : "—"} />
                <Fact label="Opening → closing" value={`${formatCurrency(preview.openingBalance ?? 0)} → ${formatCurrency(preview.closingBalance ?? 0)}`} />
                <Fact label="Lines" value={`${preview.newLines} new · ${preview.alreadyImported} already imported`} />
              </dl>
              <ul className="space-y-1.5">
                {preview.checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-2 text-xs">
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
                    <span>{c.label}{c.detail && <span className="block text-muted-foreground">{c.detail}</span>}</span>
                  </li>
                ))}
              </ul>
              {preview.newAccount && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                  <p className="text-xs">This account has not been imported before. It is a Swapngo business account.</p>
                  <Switch checked={confirmAccount} onCheckedChange={setConfirmAccount} aria-label="Confirm account" />
                </div>
              )}
            </div>
          )}

          {importer.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {importer.error instanceof ApiError ? importer.error.message : "Something went wrong."}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canImport || importer.isPending}
            onClick={() => file && importer.mutate({ file, confirmNewAccount: confirmAccount }, { onSuccess: () => onOpenChange(false) })}
          >
            {importer.isPending && <Spinner className="h-4 w-4" />} Import {preview?.newLines ?? ""} lines
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriseDialog({ line, onClose }: { line: StatementLineRow | null; onClose: () => void }) {
  const save = useCategoriseBankLine();
  const [category, setCategory] = useState("");
  const [applyAll, setApplyAll] = useState(true);

  useEffect(() => { setCategory(line?.category ?? ""); setApplyAll(true); }, [line]);
  if (!line) return null;
  const isCredit = line.kind === "bank_credit";

  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Categorise bank line</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <p className="break-words">{line.description}</p>
            <p className="mt-1 font-medium">{isCredit ? "Money in" : "Money out"} · {formatCurrency(Math.abs(line.amount))} · {line.valueDate && formatDate(line.valueDate)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
              <SelectContent><CategoryOptions only={isCredit ? "in" : "out"} /></SelectContent>
            </Select>
          </div>
          {line.counterpartyKey && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Apply to {line.counterpartyKey}</p>
                <p className="text-xs text-muted-foreground">Also set it on this counterparty's other uncategorised lines, and suggest it for future ones.</p>
              </div>
              <Switch checked={applyAll} onCheckedChange={setApplyAll} aria-label="Apply to counterparty" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!category || save.isPending}
            onClick={() => save.mutate({ id: line.id, category, applyToCounterparty: applyAll }, { onSuccess: onClose })}
          >
            {save.isPending && <Spinner className="h-4 w-4" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

function ExceptionsTab({ canResolve }: { canResolve: boolean }) {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [code, setCode] = useState("all");
  const { data, isLoading, isError, refetch } = useExceptions(status, code === "all" ? undefined : code);
  const [resolving, setResolving] = useState<ExceptionRow | null>(null);
  const recover = useRecoverPayment();

  const columns: DataTableColumn<ExceptionRow & { id: string }>[] = [
    {
      header: "Exception", key: "code",
      render: (e) => (
        <div className="min-w-0">
          <p className="text-sm font-medium"><span className="font-mono text-xs text-muted-foreground">{e.code}</span> {EXCEPTION_INFO[e.code]?.title ?? ""}</p>
          <p className="max-w-[28rem] truncate text-xs text-muted-foreground" title={e.description ?? ""}>{e.description}</p>
        </div>
      ),
    },
    { header: "Date", key: "occurredAt", hideOnMobile: true, render: (e) => (e.occurredAt ? formatDate(e.occurredAt) : <Dash />) },
    { header: "Rider", key: "riderName", hideOnMobile: true, render: (e) => e.riderName ?? <Dash /> },
    { header: "Reference", key: "externalId", hideOnMobile: true, render: (e) => <span className="font-mono text-xs">{e.externalId}</span> },
    { header: "Amount", key: "amount", className: "text-right", render: (e) => <Money value={e.amount} /> },
    {
      header: "", key: "actions", className: "text-right",
      render: (e) => status === "resolved" ? <span className="text-xs text-muted-foreground">{e.resolvedNote}</span>
        : canResolve && e.kind === "line" ? (
          <div className="flex justify-end gap-1">
            {e.code === "E1" && e.gatewayOrderId && (
              <Button size="sm" variant="outline" disabled={recover.isPending} onClick={() => recover.mutate(e.lineId!)}>Recover</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setResolving(e)}>Resolve</Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <Card className="flex min-h-[18rem] flex-col overflow-hidden">
        <FilterBar
          filters={
            <>
              <Select value={status} onValueChange={(v) => setStatus(v as "open" | "resolved")}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every kind</SelectItem>
                  {Object.entries(EXCEPTION_INFO).map(([k, v]) => <SelectItem key={k} value={k}>{k} · {v.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          }
        />
        <DataTable
          fill
          columns={columns}
          data={(data ?? []).map((e) => ({ ...e, id: `${e.kind}:${e.id}` }))}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle={status === "open" ? "Nothing to resolve" : "No resolved exceptions"}
          emptyDescription={status === "open" ? "Every synced Razorpay line and imported bank line matches our records." : undefined}
        />
      </Card>
      <p className="text-xs text-muted-foreground">
        E2 and E3 are about money that should appear in a settlement but does not yet — they clear on their own when Razorpay settles it, or after you check them in the Razorpay dashboard.
      </p>
      <ResolveDialog row={resolving} onClose={() => setResolving(null)} />
    </>
  );
}

function ResolveDialog({ row, onClose }: { row: ExceptionRow | null; onClose: () => void }) {
  const resolve = useResolveException();
  const [note, setNote] = useState("");
  const [ignore, setIgnore] = useState(false);
  useEffect(() => { setNote(""); setIgnore(false); resolve.reset(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [row]);
  if (!row) return null;
  const info = EXCEPTION_INFO[row.code];
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{row.code} · {info?.title ?? "Exception"}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          {info && <p className="text-xs text-muted-foreground">{info.hint}</p>}
          <div className="space-y-1.5">
            <Label>What was checked or done</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Chargeback accepted by Razorpay; credit note raised" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Not a problem</p>
              <p className="text-xs text-muted-foreground">Mark as ignored rather than resolved — for example a test transaction.</p>
            </div>
            <Switch checked={ignore} onCheckedChange={setIgnore} aria-label="Ignore" />
          </div>
          {resolve.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {resolve.error instanceof ApiError ? resolve.error.message : "Something went wrong."}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={note.trim().length < 5 || resolve.isPending}
            onClick={() => resolve.mutate({ id: row.lineId!, action: ignore ? "ignore" : "resolve", note: note.trim() }, { onSuccess: onClose })}
          >
            {resolve.isPending && <Spinner className="h-4 w-4" />} {ignore ? "Ignore" : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Live check — the original side-by-side with Razorpay's payment list
// ---------------------------------------------------------------------------

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function LiveCheckTab() {
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const { data, isLoading, isError, refetch } = useReconciliation(from, to);

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sm:w-44" />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sm:w-44" />
        </div>
        <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-sm">
          Asks Razorpay directly for every payment in the range and compares it with our ledger. Use it for a quick check between settlement syncs.
        </p>
      </div>

      <div className="p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !data ? null : data.gatewayUnavailable ? (
          <div className="rounded-md bg-warning/10 px-4 py-3 text-sm text-warning">
            Payment gateway isn't configured — showing internal figures only. Add Razorpay keys to compare against gateway records.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Internal payments" value={data.internalPaymentCount} icon={CreditCard} />
              <StatCard label="Gateway payments" value={data.gatewayPaymentCount} icon={Landmark} />
              <StatCard label="Unmatched internal" value={data.unmatchedInternal.length} icon={AlertTriangle} tone={data.unmatchedInternal.length > 0 ? "destructive" : "success"} />
              <StatCard label="Missing internal" value={data.missingInternal.length} icon={FileWarning} tone={data.missingInternal.length > 0 ? "destructive" : "success"} />
            </div>

            {data.unmatchedInternal.length === 0 && data.missingInternal.length === 0 && data.failedWebhooks.length === 0 ? (
              <div className="mt-6 flex items-center gap-2 rounded-md bg-success/10 px-4 py-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> Everything reconciles for this range.
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {data.unmatchedInternal.length > 0 && (
                  <Section title="Unmatched internal payments" subtitle="In our ledger but not found at the gateway — investigate immediately.">
                    <SimpleTable rows={data.unmatchedInternal} columns={[
                      { header: "Gateway payment ID", render: (r) => r.gatewayPaymentId },
                      { header: "Amount", render: (r) => formatCurrency(r.amount) },
                      { header: "Applied", render: (r) => formatDate(r.appliedAt) },
                    ]} />
                  </Section>
                )}
                {data.missingInternal.length > 0 && (
                  <Section title="Missing internal payments" subtitle="Captured at the gateway but never recorded here — usually a missed or failed webhook.">
                    <SimpleTable rows={data.missingInternal} columns={[
                      { header: "Gateway payment ID", render: (r) => r.gatewayPaymentId },
                      { header: "Amount", render: (r) => formatCurrency(r.amount) },
                      { header: "Status", render: (r) => r.status },
                      { header: "Created", render: (r) => formatDate(r.createdAt) },
                    ]} />
                  </Section>
                )}
                {data.failedWebhooks.length > 0 && (
                  <Section title="Failed webhook deliveries" subtitle="Signature-invalid or never-processed events in this range.">
                    <SimpleTable rows={data.failedWebhooks} columns={[
                      { header: "Event type", render: (r) => r.eventType },
                      { header: "Signature valid", render: (r) => (r.signatureValid ? "Yes" : "No") },
                      { header: "Processed", render: (r) => (r.processed ? "Yes" : "No") },
                      { header: "Error", render: (r) => r.error ?? "—" },
                      { header: "Received", render: (r) => formatDate(r.receivedAt) },
                    ]} />
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-2 text-xs text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function SimpleTable<T>({ rows, columns }: { rows: T[]; columns: { header: string; render: (row: T) => React.ReactNode }[] }) {
  if (rows.length === 0) return <EmptyState title="Nothing here" />;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>{columns.map((c) => <th key={c.header} className="px-3 py-2 text-left font-medium text-muted-foreground">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((c) => <td key={c.header} className="px-3 py-2">{c.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MatchBadge({ line }: { line: StatementLineRow }) {
  if (line.matchStatus === "matched") return <Badge variant="success">Matched</Badge>;
  if (line.matchStatus === "exception") return <Badge variant="destructive">{line.exceptionCode}</Badge>;
  if (line.matchStatus === "resolved") return <Badge variant="muted">Resolved</Badge>;
  if (line.matchStatus === "ignored") return <Badge variant="muted">Ignored</Badge>;
  return <Badge variant="outline">Open</Badge>;
}

function Money({ value, strong }: { value: number; strong?: boolean }) {
  return <span className={cn("tabular-nums", strong && "font-medium", value < 0 && "text-destructive")}>{value < 0 ? "−" : ""}{formatCurrency(Math.abs(value))}</span>;
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-medium", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function Equation({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "font-semibold")}>
      <span className="font-sans">{label}</span>
      <Money value={value} />
    </div>
  );
}
