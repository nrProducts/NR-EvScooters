import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ChevronDown, Download, FileArchive, FileText, Plus, ReceiptIndianRupee, Undo2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { FilterBar } from "@/components/common/FilterBar";
import { Pagination } from "@/components/common/Pagination";
import { SearchBar } from "@/components/common/SearchBar";
import { SideDrawer } from "@/components/common/SideDrawer";
import { StatCard } from "@/components/common/StatCard";
import { Spinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import {
  useCreateGstProfile, useGstProfiles, useIssuePendingTaxDocuments, usePendingTaxDocuments,
  useTaxDocuments, useTaxDocumentSummary,
} from "@/hooks/useGst";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import {
  downloadTaxDocumentPdf, downloadTaxDocumentZip, downloadTaxRegister,
  type CreateGstProfileInput, type GstProfile, type TaxDocument, type TaxDocumentSource, type TaxDocumentType,
} from "@/services/api/gst";

/** GST registration took effect on 2 Sep 2026 — no document can be dated earlier. */
const FIRST_MONTH = "2026-09";

const SOURCE_LABEL: Record<TaxDocumentSource, string> = {
  invoice_paid: "Payment received",
  invoice_unpaid_30d: "Unpaid 30 days",
  deposit_retained: "Deposit kept",
  refund: "Refund",
};

const SOURCE_HINT: Record<TaxDocumentSource, string> = {
  invoice_paid: "Issued when the rider's bill was fully paid.",
  invoice_unpaid_30d: "Issued 30 days after the rental period ended with the bill still unpaid (Rule 47 — GST is due even unpaid).",
  deposit_retained: "Issued when the return settled and part of the security deposit was kept (charges or forfeiture).",
  refund: "Issued when a cancellation or goodwill refund was paid out. Reduces the original tax invoice.",
};

function monthsSince(first: string, now = new Date()): string[] {
  const out: string[] = [];
  const [fy, fm] = first.split("-").map(Number);
  let y = fy;
  let m = fm;
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));

/**
 * GST register — every tax invoice and credit note, by month.
 *
 * Nothing on this page creates a document. They are issued by the database
 * as money moves (bill paid, deposit kept, refund paid out, bill unpaid 30
 * days after its period). This is where they are read, checked, exported for
 * the accountant, and where the GST profile they are issued under lives.
 */
export default function TaxInvoicesPage() {
  usePageSubtitle("GST tax invoices and credit notes, issued automatically as money is received and refunded.");

  const user = useAuthStore((s) => s.user);
  const canConfigure = hasAction(user, "gst", "configure");

  const months = useMemo(() => monthsSince(FIRST_MONTH), []);
  const [month, setMonth] = useState(months[0]);
  const range = monthRange(month);

  const [busy, setBusy] = useState<null | "xlsx" | "csv" | "zip">(null);
  const run = async (kind: "xlsx" | "csv" | "zip") => {
    setBusy(kind);
    try {
      if (kind === "zip") await downloadTaxDocumentZip(range.from, range.to);
      else await downloadTaxRegister(range.from, range.to, kind);
    } catch (err) {
      toastError(err, "Download failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      <Tabs defaultValue="register">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="flex-wrap">
            <TabsTrigger value="register">Register</TabsTrigger>
            <TabsTrigger value="profile">GST profile</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Month"><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex">
              <Button size="sm" className="rounded-r-none" disabled={!!busy} onClick={() => void run("xlsx")}>
                {busy === "xlsx" ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} Export register
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="More downloads" disabled={!!busy}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void run("xlsx")}>Register — Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void run("csv")}>Register — CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void run("zip")}>
                    <FileArchive className="mr-2 h-3.5 w-3.5" /> All PDFs for the month (.zip)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <TabsContent value="register" className="space-y-4">
          <PendingNotice canConfigure={canConfigure} />
          <SummaryRow from={range.from} to={range.to} />
          <RegisterTable from={range.from} to={range.to} />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileTab canConfigure={canConfigure} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PendingNotice({ canConfigure }: { canConfigure: boolean }) {
  const { data } = usePendingTaxDocuments();
  const issue = useIssuePendingTaxDocuments();
  if (!data || (data.total === 0 && data.recentFailures.length === 0)) return null;

  const parts = [
    data.byKind.paid && `${data.byKind.paid} paid bill${data.byKind.paid === 1 ? "" : "s"}`,
    data.byKind.kept && `${data.byKind.kept} settled return${data.byKind.kept === 1 ? "" : "s"}`,
    data.byKind.refund && `${data.byKind.refund} refund${data.byKind.refund === 1 ? "" : "s"}`,
    data.byKind.unpaid && `${data.byKind.unpaid} bill${data.byKind.unpaid === 1 ? "" : "s"} unpaid 30 days`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3 rounded-md bg-warning/10 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          {data.total > 0 ? (
            <p>
              <span className="font-medium">{data.total} document{data.total === 1 ? "" : "s"} not yet issued</span>
              {parts.length > 0 && ` — ${parts.join(", ")}.`} The daily run at 08:50 issues them automatically.
            </p>
          ) : (
            <p className="font-medium">Every document is issued.</p>
          )}
          {data.recentFailures.length > 0 && (
            <p className="mt-1 text-xs">
              {data.recentFailures.length} issue attempt{data.recentFailures.length === 1 ? "" : "s"} failed in the last 30 days.
              Latest: {data.recentFailures[0].error || "unknown error"} ({formatDate(data.recentFailures[0].at)})
            </p>
          )}
        </div>
      </div>
      {canConfigure && data.total > 0 && (
        <Button size="sm" variant="outline" disabled={issue.isPending} onClick={() => issue.mutate()}>
          {issue.isPending && <Spinner className="h-3.5 w-3.5" />} Issue now
        </Button>
      )}
    </div>
  );
}

function SummaryRow({ from, to }: { from: string; to: string }) {
  const { data, isLoading, isError, refetch } = useTaxDocumentSummary(from, to);
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const dash = "—";
  const ti = data?.taxInvoices;
  const cn = data?.creditNotes;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Tax invoices" value={isLoading || !ti ? dash : ti.count} icon={ReceiptIndianRupee} />
        <StatCard label="Credit notes" value={isLoading || !cn ? dash : cn.count} icon={Undo2} tone={cn?.count ? "warning" : "default"} />
        <StatCard label="Net taxable value" value={isLoading || !data ? dash : formatCurrency(data.net.taxable)} icon={FileText} tone="info" />
        <StatCard label="Net CGST" value={isLoading || !data ? dash : formatCurrency(data.net.cgst)} tone="success" />
        <StatCard label="Net SGST" value={isLoading || !data ? dash : formatCurrency(data.net.sgst)} tone="success" />
      </div>
      {data && (
        <p className="text-xs text-muted-foreground">
          {ti?.firstNumber ? `Tax invoices ${ti.firstNumber} – ${ti.lastNumber}` : "No tax invoices"}
          {cn?.firstNumber ? ` · Credit notes ${cn.firstNumber} – ${cn.lastNumber}` : ""}
          {" · "}B2C, intra-state Tamil Nadu (33). Net figures are what GSTR-1 Table 7 and GSTR-3B 3.1(a) report.
          {data.cancelledCount > 0 && ` ${data.cancelledCount} cancelled document(s) excluded.`}
        </p>
      )}
    </div>
  );
}

function RegisterTable({ from, to }: { from: string; to: string }) {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<TaxDocumentType | "all">("all");
  const [source, setSource] = useState<TaxDocumentSource | "all">("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TaxDocument | null>(null);

  useEffect(() => { setPage(1); }, [from, to]);

  const { data, isLoading, isError, refetch } = useTaxDocuments({
    from, to, page, pageSize: 15,
    search: search.trim() || undefined,
    docType: docType === "all" ? undefined : docType,
    source: source === "all" ? undefined : source,
  });

  const columns: DataTableColumn<TaxDocument>[] = [
    {
      header: "Number", key: "docNumber",
      render: (d) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium">{d.docNumber}</p>
          <p className="text-xs text-muted-foreground">{d.docType === "tax_invoice" ? "Tax invoice" : "Credit note"}</p>
        </div>
      ),
    },
    { header: "Date", key: "issuedOn", render: (d) => formatDate(d.issuedOn) },
    { header: "Rider", key: "recipientName", render: (d) => <span className="truncate text-sm">{d.recipientName}</span> },
    {
      header: "Reason", key: "source", hideOnMobile: true,
      render: (d) => <span className="text-xs">{SOURCE_LABEL[d.source]}</span>,
    },
    {
      header: "Taxable", key: "taxableAmount", className: "text-right", hideOnMobile: true,
      render: (d) => <Signed doc={d} value={d.taxableAmount} />,
    },
    {
      header: "CGST + SGST", key: "tax", className: "text-right", hideOnMobile: true,
      render: (d) => <Signed doc={d} value={d.cgstAmount + d.sgstAmount} />,
    },
    {
      header: "Total", key: "totalAmount", className: "text-right",
      render: (d) => <Signed doc={d} value={d.totalAmount} strong />,
    },
    {
      header: "", key: "pdf", className: "text-right",
      render: (d) => (
        <Button
          size="sm" variant="ghost" aria-label={`Download ${d.docNumber}`}
          onClick={(e) => {
            e.stopPropagation();
            downloadTaxDocumentPdf(d.id).catch((err) => toastError(err, "Download failed"));
          }}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <Card className="flex min-h-[20rem] flex-col overflow-hidden">
      <FilterBar
        search={
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search number or rider"
            className="w-full sm:w-72"
          />
        }
        filters={
          <>
            <Select value={docType} onValueChange={(v) => { setDocType(v as TaxDocumentType | "all"); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All documents</SelectItem>
                <SelectItem value="tax_invoice">Tax invoices</SelectItem>
                <SelectItem value="credit_note">Credit notes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={(v) => { setSource(v as TaxDocumentSource | "all"); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any reason</SelectItem>
                {(Object.keys(SOURCE_LABEL) as TaxDocumentSource[]).map((s) => (
                  <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
      <DataTable
        fill
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        onRowClick={setSelected}
        emptyTitle="No GST documents"
        emptyDescription="Nothing was issued in this month, or nothing matches the filters."
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}

      <DocumentDrawer doc={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

/** Credit notes read as reductions everywhere they are listed beside invoices. */
function Signed({ doc, value, strong }: { doc: TaxDocument; value: number; strong?: boolean }) {
  const credit = doc.docType === "credit_note";
  return (
    <span className={cn("tabular-nums", strong && "font-medium", credit && "text-destructive", doc.status === "cancelled" && "line-through opacity-60")}>
      {credit ? "−" : ""}{formatCurrency(value)}
    </span>
  );
}

function DocumentDrawer({ doc, onClose }: { doc: TaxDocument | null; onClose: () => void }) {
  if (!doc) return null;
  const credit = doc.docType === "credit_note";
  const half = doc.gstRate / 2;

  return (
    <SideDrawer open={!!doc} onOpenChange={(o) => !o && onClose()} title={doc.docNumber} className="sm:max-w-xl">
      <div className="mt-4 space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={credit ? "warning" : "info"}>{credit ? "Credit note" : "Tax invoice"}</Badge>
          <Badge variant="outline">{SOURCE_LABEL[doc.source]}</Badge>
          {doc.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{SOURCE_HINT[doc.source]}</p>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Rider" value={doc.recipientName} />
          <Fact label="Date" value={formatDate(doc.issuedOn)} />
          {doc.supplyDate !== doc.issuedOn && <Fact label="Date of supply" value={formatDate(doc.supplyDate)} />}
          <Fact label="Place of supply" value={`Tamil Nadu (${doc.placeOfSupply})`} />
          <Fact label="SAC · rate" value={`${doc.sacCode} · ${doc.gstRate}%`} />
          {doc.billNumber && <Fact label="Bill" value={doc.billNumber} mono />}
          {doc.originalDocNumber && <Fact label="Against tax invoice" value={doc.originalDocNumber} mono />}
        </dl>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Line</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Taxable</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">CGST {half}%</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">SGST {half}%</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.taxable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.cgst)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.sgst)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.gross)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(doc.taxableAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(doc.cgstAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(doc.sgstAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(doc.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <Button
          className="w-full"
          onClick={() => downloadTaxDocumentPdf(doc.id).catch((err) => toastError(err, "Download failed"))}
        >
          <Download className="h-4 w-4" /> Download PDF
        </Button>
      </div>
    </SideDrawer>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("truncate font-medium", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProfileTab({ canConfigure }: { canConfigure: boolean }) {
  const { data, isLoading, isError, refetch } = useGstProfiles();
  const [open, setOpen] = useState(false);

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const current = data.find((p) => p.isCurrent) ?? null;
  const upcoming = data.filter((p) => !p.isCurrent && p.effectiveFrom > (current?.effectiveFrom ?? ""));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Profile in force today</h3>
            <p className="text-xs text-muted-foreground">
              Every tax invoice and credit note prints these details. A change is a new profile from a date — the one a document was issued under never changes.
            </p>
          </div>
          {canConfigure && (
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Schedule a change</Button>
          )}
        </div>
        {current ? (
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Legal name" value={current.legalName} />
            <Fact label="GSTIN" value={current.gstin} mono />
            <Fact label="State" value={`${current.stateName} (${current.stateCode})`} />
            <Fact label="SAC" value={current.sacCode} />
            <Fact label="GST rate" value={`${current.gstRate}% (CGST ${current.gstRate / 2}% + SGST ${current.gstRate / 2}%)`} />
            <Fact label="In force from" value={formatDate(current.effectiveFrom)} />
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <dt className="text-xs text-muted-foreground">Address</dt>
              <dd className="font-medium">{current.address}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 rounded-md bg-warning/10 px-4 py-3 text-sm text-warning">
            No GST profile is in force today, so no documents can be issued.
          </p>
        )}
        {upcoming.length > 0 && (
          <p className="mt-4 rounded-md bg-info/10 px-4 py-3 text-xs text-info">
            Scheduled: {upcoming.map((p) => `${p.gstRate}% from ${formatDate(p.effectiveFrom)}`).join(" · ")}
          </p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {["From", "Legal name", "GSTIN", "SAC", "Rate", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2">{formatDate(p.effectiveFrom)}</td>
                  <td className="px-4 py-2">{p.legalName}</td>
                  <td className="px-4 py-2 font-mono text-xs">{p.gstin}</td>
                  <td className="px-4 py-2">{p.sacCode}</td>
                  <td className="px-4 py-2">{p.gstRate}%</td>
                  <td className="px-4 py-2">
                    {p.isCurrent ? <Badge variant="success">In force</Badge>
                      : p.effectiveFrom > (current?.effectiveFrom ?? "") ? <Badge variant="info">Scheduled</Badge>
                        : <Badge variant="muted">Superseded</Badge>}
                    {p.inUse && <span className="ml-2 text-xs text-muted-foreground">documents issued</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ProfileDialog open={open} onOpenChange={setOpen} base={current} />
    </div>
  );
}

function ProfileDialog({
  open, onOpenChange, base,
}: { open: boolean; onOpenChange: (open: boolean) => void; base: GstProfile | null }) {
  const create = useCreateGstProfile();
  const [form, setForm] = useState<CreateGstProfileInput>(() => emptyForm(base));

  useEffect(() => {
    if (open) { setForm(emptyForm(base)); create.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, base]);

  const set = <K extends keyof CreateGstProfileInput>(k: K, v: CreateGstProfileInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fields = create.error instanceof ApiError ? create.error.fields ?? {} : {};
  const canSubmit = !!form.effectiveFrom && form.legalName.trim().length >= 2 && form.gstin.trim().length === 15
    && form.address.trim().length >= 10 && /^[0-9]{4,8}$/.test(form.sacCode) && form.gstRate >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule a GST profile change</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-md bg-info/10 px-3 py-2 text-xs text-info">
            Documents for supplies from this date onwards use the new details. Earlier documents keep the profile they were issued under. Rider prices do not change — the rate only decides how much of each payment is GST.
          </p>
          <FormField label="In force from" error={fields.effectiveFrom}>
            <Input type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} />
          </FormField>
          <FormField label="Legal name" error={fields.legalName}>
            <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
          </FormField>
          <FormField label="GSTIN" error={fields.gstin}>
            <Input value={form.gstin} maxLength={15} className="font-mono uppercase" onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="SAC" error={fields.sacCode}>
              <Input value={form.sacCode} inputMode="numeric" onChange={(e) => set("sacCode", e.target.value.replace(/\D/g, ""))} />
            </FormField>
            <FormField label="GST rate (%)" error={fields.gstRate}>
              <Input type="number" min={0} max={40} step={0.5} value={form.gstRate} onChange={(e) => set("gstRate", Number(e.target.value))} />
            </FormField>
          </div>
          <FormField label="State" error={fields.stateName}>
            <Input value={form.stateName} onChange={(e) => set("stateName", e.target.value)} />
          </FormField>
          <FormField label="Address (as on the registration certificate)" error={fields.address}>
            <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </FormField>

          {create.error && !Object.keys(fields).length && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {create.error instanceof ApiError ? create.error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!canSubmit || create.isPending}
            onClick={() => create.mutate(
              { ...form, legalName: form.legalName.trim(), gstin: form.gstin.trim(), address: form.address.trim(), stateName: form.stateName.trim() },
              { onSuccess: () => onOpenChange(false) },
            )}
          >
            {create.isPending && <Spinner className="h-4 w-4" />} Save profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyForm(base: GstProfile | null): CreateGstProfileInput {
  return {
    effectiveFrom: "",
    legalName: base?.legalName ?? "",
    tradeName: base?.tradeName ?? null,
    gstin: base?.gstin ?? "",
    stateName: base?.stateName ?? "Tamil Nadu",
    address: base?.address ?? "",
    sacCode: base?.sacCode ?? "9973",
    gstRate: base?.gstRate ?? 5,
  };
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
