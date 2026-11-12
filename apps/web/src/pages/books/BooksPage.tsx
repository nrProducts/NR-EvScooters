import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Download, FileSpreadsheet, Landmark, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/common/StatCard";
import { Spinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import {
  useAdvanceTax, useDepositRegister, useProfitAndLoss, useReceivables, useTrialBalance, useUnbalancedVouchers,
} from "@/hooks/useBooks";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toastHelpers";
import { downloadBooksXlsx, downloadTallyXml, type TrialBalanceRow } from "@/services/api/books";

/** The books start at GST registration, 2 Sep 2026. */
const FIRST_MONTH = "2026-09";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Months newest first, plus each financial year to date. Value is "from|to". */
function periodOptions(today = todayIso()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const [ty, tm] = today.split("-").map(Number);
  const fyStart = tm >= 4 ? ty : ty - 1;
  out.push({ value: `${fyStart}-04-01|${today}`, label: `FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")} to date` });
  let [y, m] = [ty, tm];
  const [fy, fm] = FIRST_MONTH.split("-").map(Number);
  while (y > fy || (y === fy && m >= fm)) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${month}-${String(last).padStart(2, "0")}`;
    out.push({
      value: `${month}-01|${end < today ? end : today}`,
      label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`)),
    });
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return out;
}

/** Debit-positive balance shown the way an accountant reads it. */
function DrCr({ value }: { value: number }) {
  if (Math.abs(value) < 0.005) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatCurrency(Math.abs(value))} {value > 0 ? "Dr" : "Cr"}</span>;
}

/**
 * The books — derived, never typed in.
 *
 * Every posting comes from v_ledger_postings: tax invoices, receipts,
 * deposits kept, refunds, Razorpay settlements, categorised bank lines and
 * confirmed purchase bills. This page reads them as a trial balance and a
 * profit and loss, proves the deposit and receivable balances against the
 * registers they come from, and exports the lot to Tally for the CA.
 */
export default function BooksPage() {
  usePageSubtitle("Trial balance, profit and loss and the registers behind them, built from every recorded money movement.");

  const options = useMemo(() => periodOptions(), []);
  const [period, setPeriod] = useState(options[1]?.value ?? options[0].value);
  const [from, to] = period.split("|");

  const [busy, setBusy] = useState<null | "tally" | "xlsx">(null);
  const run = async (kind: "tally" | "xlsx") => {
    setBusy(kind);
    try {
      if (kind === "tally") await downloadTallyXml(from, to);
      else await downloadBooksXlsx(from, to);
    } catch (err) {
      toastError(err, "Download failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <Tabs defaultValue="pl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="flex-wrap">
            <TabsTrigger value="pl">Profit &amp; loss</TabsTrigger>
            <TabsTrigger value="tb">Trial balance</TabsTrigger>
            <TabsTrigger value="deposits">Deposits</TabsTrigger>
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="tax">Advance tax</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Period"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex">
              <Button size="sm" className="rounded-r-none" disabled={!!busy} onClick={() => void run("tally")}>
                {busy === "tally" ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Export to Tally
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="More downloads" disabled={!!busy}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void run("tally")}>
                    <Download className="mr-2 h-3.5 w-3.5" /> Tally Prime — masters and vouchers (.xml)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void run("xlsx")}>
                    <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Trial balance, P&amp;L and day book (.xlsx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <UnbalancedNotice />

        <TabsContent value="pl"><ProfitAndLossTab from={from} to={to} /></TabsContent>
        <TabsContent value="tb"><TrialBalanceTab from={from} to={to} /></TabsContent>
        <TabsContent value="deposits"><DepositsTab /></TabsContent>
        <TabsContent value="receivables"><ReceivablesTab /></TabsContent>
        <TabsContent value="tax"><AdvanceTaxTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function UnbalancedNotice() {
  const { data } = useUnbalancedVouchers();
  if (!data?.length) return null;
  return (
    <div className="mt-4 flex items-start gap-2 rounded-md bg-warning/10 px-4 py-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{data.length} voucher{data.length === 1 ? "" : "s"} do not balance</p>
        <p className="text-xs">
          Usually a bank line in Suspense or a record changed by hand. First: {data[0].voucherKey} on {formatDate(data[0].postingDate)} —
          debits {formatCurrency(data[0].debits)}, credits {formatCurrency(data[0].credits)}.
        </p>
      </div>
    </div>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("px-4 py-2 font-medium text-muted-foreground", right ? "text-right" : "text-left")}>{children}</th>;
}

function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-4 py-2", right && "text-right tabular-nums", className)}>{children}</td>;
}

const Loading = () => <p className="text-sm text-muted-foreground">Loading...</p>;

// ---------------------------------------------------------------------------

function ProfitAndLossTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, refetch } = useProfitAndLoss(from, to);
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;

  const list = (rows: typeof data.income, total: number, label: string) => (
    <table className="w-full text-sm">
      <tbody>
        {rows.length === 0 && <tr><Td className="text-muted-foreground">Nothing in this period.</Td></tr>}
        {rows.map((r) => (
          <tr key={r.ledger} className="border-t border-border first:border-t-0">
            <Td>{r.ledger}<span className="ml-2 text-xs text-muted-foreground">{r.group}</span></Td>
            <Td right>{formatCurrency(r.amount)}</Td>
          </tr>
        ))}
        <tr className="border-t border-border font-medium"><Td>{label}</Td><Td right>{formatCurrency(total)}</Td></tr>
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Income (excl. GST)" value={formatCurrency(data.totalIncome)} icon={TrendingUp} tone="success" />
        <StatCard label="Expenses (excl. claimable GST)" value={formatCurrency(data.totalExpenses)} icon={TrendingDown} tone="warning" />
        <StatCard label={data.profit >= 0 ? "Profit" : "Loss"} value={formatCurrency(Math.abs(data.profit))} icon={Wallet} tone={data.profit >= 0 ? "info" : "destructive"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Income">{list(data.income, data.totalIncome, "Total income")}</Section>
        <Section title="Expenses">{list(data.expenses, data.totalExpenses, "Total expenses")}</Section>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDate(data.from)} – {formatDate(data.to)}. Before year-end adjustments — depreciation, partners' interest and remuneration, and accruals are the CA's.
        Security deposits are a liability, not income, until kept.
      </p>
    </div>
  );
}

function TrialBalanceTab({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, refetch } = useTrialBalance(from, to);
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;

  const groups = new Map<string, TrialBalanceRow[]>();
  for (const r of data.rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const balanced = Math.abs(data.totals.debit - data.totals.credit) < 0.01;

  return (
    <Section
      title="Trial balance"
      hint={`${formatDate(data.from)} – ${formatDate(data.to)}. Opening is everything before the period.`}
      action={balanced ? <Badge variant="success">Balanced</Badge> : <Badge variant="destructive">Off by {formatCurrency(Math.abs(data.totals.debit - data.totals.credit))}</Badge>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr><Th>Ledger</Th><Th right>Opening</Th><Th right>Debit</Th><Th right>Credit</Th><Th right>Closing</Th></tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && <tr><Td className="text-muted-foreground">No postings yet.</Td></tr>}
            {[...groups.entries()].map(([group, rows]) => (
              <GroupRows key={group} group={group} rows={rows} />
            ))}
            <tr className="border-t-2 border-border font-medium">
              <Td>Total</Td><Td right>{""}</Td>
              <Td right>{formatCurrency(data.totals.debit)}</Td>
              <Td right>{formatCurrency(data.totals.credit)}</Td>
              <Td right>{""}</Td>
            </tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function GroupRows({ group, rows }: { group: string; rows: TrialBalanceRow[] }) {
  return (
    <>
      <tr className="border-t border-border bg-muted/20">
        <td colSpan={5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.ledger} className="border-t border-border">
          <Td className={cn(r.ledger === "Suspense" && "text-warning")}>{r.ledger}</Td>
          <Td right><DrCr value={r.opening} /></Td>
          <Td right>{r.debit ? formatCurrency(r.debit) : "—"}</Td>
          <Td right>{r.credit ? formatCurrency(r.credit) : "—"}</Td>
          <Td right className="font-medium"><DrCr value={r.closing} /></Td>
        </tr>
      ))}
    </>
  );
}

function DepositsTab() {
  const { data, isLoading, isError, refetch } = useDepositRegister();
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;
  const tied = Math.abs(data.difference) < 0.01;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Deposits held (register)" value={formatCurrency(data.heldTotal)} icon={Landmark} tone="info" />
        <StatCard label="Rider Security Deposits (ledger)" value={formatCurrency(data.ledgerBalance)} tone="default" />
        <StatCard label="Difference" value={formatCurrency(data.difference)} tone={tied ? "success" : "warning"} />
      </div>
      {!tied && (
        <p className="rounded-md bg-warning/10 px-4 py-3 text-xs text-warning">
          The ledger and the register differ. Common reasons: a deposit released but its refund not yet paid out, a deposit billed on a bill still unpaid, or a deposit taken before GST registration (2 Sep 2026), which has no tax invoice behind it.
        </p>
      )}
      <Section title={`Held deposits · ${data.rows.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr><Th>Rider</Th><Th>Held since</Th><Th>Refundable from</Th><Th right>Amount</Th></tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><Td className="text-muted-foreground">No deposits held.</Td></tr>}
              {data.rows.map((r) => (
                <tr key={r.depositId} className="border-t border-border">
                  <Td>{r.riderName ?? "—"}</Td>
                  <Td>{r.heldAt ? formatDate(r.heldAt) : "—"}</Td>
                  <Td>{r.refundEligibleOn ? formatDate(r.refundEligibleOn) : "—"}</Td>
                  <Td right>{formatCurrency(r.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function ReceivablesTab() {
  const { data, isLoading, isError, refetch } = useReceivables();
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;
  const total = data.reduce((t, r) => t + r.balance, 0);
  const over30 = data.filter((r) => r.overdueDays > 30).reduce((t, r) => t + r.balance, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Owed by riders" value={formatCurrency(total)} icon={Wallet} tone="info" />
        <StatCard label="Over 30 days late" value={formatCurrency(over30)} tone={over30 > 0 ? "warning" : "success"} />
      </div>
      <Section title={`Unpaid bills · ${data.length}`} hint="Issued bills with a balance. A bill still unpaid 30 days after its period already has its tax invoice — the GST is owed either way.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr><Th>Rider</Th><Th>Bill</Th><Th>Due</Th><Th right>Days late</Th><Th right>Balance</Th></tr></thead>
            <tbody>
              {data.length === 0 && <tr><Td className="text-muted-foreground">Nothing owed.</Td></tr>}
              {data.map((r) => (
                <tr key={r.invoiceId} className="border-t border-border">
                  <Td>{r.riderName ?? "—"}</Td>
                  <Td className="font-mono text-xs">{r.billNumber}</Td>
                  <Td>{r.dueOn ? formatDate(r.dueOn) : "—"}</Td>
                  <Td right className={cn(r.overdueDays > 30 && "text-warning")}>{r.overdueDays || "—"}</Td>
                  <Td right>{formatCurrency(r.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function AdvanceTaxTab() {
  const { data, isLoading, isError, refetch } = useAdvanceTax();
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Loading />;
  const today = todayIso();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Profit so far (${data.monthsElapsed} mo)`} value={formatCurrency(data.profitSoFar)} icon={TrendingUp} tone="info" />
        <StatCard label="Projected for the year" value={formatCurrency(data.projectedProfit)} tone="default" />
        <StatCard label="Estimated tax" value={formatCurrency(data.estimatedTax)} tone="warning" />
        <StatCard label="Advance tax paid" value={formatCurrency(data.paid)} tone="success" />
      </div>
      <Section
        title={`Instalments · FY ${data.fy}`}
        hint="A partnership firm: 30% on profit, plus 12% surcharge above ₹1 crore, plus 4% cess. Paid amounts are bank lines categorised as income tax."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr><Th>Due by</Th><Th right>Cumulative %</Th><Th right>Cumulative due</Th><Th right>Short by</Th></tr></thead>
            <tbody>
              {data.instalments.map((i) => {
                const short = Math.max(0, i.cumulativeDue - data.paid);
                const past = i.dueOn < today;
                return (
                  <tr key={i.dueOn} className="border-t border-border">
                    <Td>{formatDate(i.dueOn)}{past && <span className="ml-2 text-xs text-muted-foreground">passed</span>}</Td>
                    <Td right>{i.cumulativePercent}%</Td>
                    <Td right>{formatCurrency(i.cumulativeDue)}</Td>
                    <Td right className={cn(past && short > 0 && "text-warning")}>{short > 0 ? formatCurrency(short) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="text-xs text-muted-foreground">
        An estimate to plan cash, not a tax computation: it annualises the books' profit before depreciation, partners' interest and remuneration.
        No advance tax is due if the year's tax is under ₹10,000. Confirm the figure with the CA before paying.
      </p>
    </div>
  );
}
