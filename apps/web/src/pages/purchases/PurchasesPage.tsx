import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Link2, Plus, Trash2, Upload, Wand2 } from "lucide-react";
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
  useAssets, useBill, useBills, useItcSummary, usePayables, usePaymentCandidates, usePurchaseCategories,
  usePurchaseMutation, useTwoBNotInBooks, useVendors,
} from "@/hooks/usePurchases";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import * as api from "@/services/api/purchases";
import type { Asset, Bill, BillInput, BillLineInput, ItcStatus, Payable, Vendor, VendorInput } from "@/services/api/purchases";

const FIRST_MONTH = "2026-09";
const SWAPNGO_STATE = "33";

const ITC_BADGE: Record<ItcStatus, { label: string; variant: "success" | "destructive" | "warning" | "muted" }> = {
  eligible: { label: "Claimable", variant: "success" },
  blocked: { label: "Blocked", variant: "destructive" },
  review: { label: "Review", variant: "warning" },
  ineligible: { label: "No GST", variant: "muted" },
};

const TWO_B_LABEL: Record<string, string> = {
  not_checked: "Not checked", matched: "In GSTR-2B", not_in_2b: "Not in 2B yet", mismatch: "Amount differs", not_applicable: "Reverse charge",
};

const VENDOR_KIND: Record<string, string> = {
  goods: "Goods supplier", services: "Services (Indian)", foreign_software: "Overseas software (reverse charge)",
  landlord: "Landlord", bank: "Bank", government: "Government", other: "Other",
};

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

/** Same rule as the backend's splitPurchaseTax — a preview only; the server computes what is saved. */
function previewTax(taxable: number, rate: number, supplierState: string | null, reverseCharge: boolean) {
  if (reverseCharge || !rate) return { cgst: 0, sgst: 0, igst: 0 };
  const tax = Math.round(taxable * rate) / 100;
  if (supplierState && supplierState !== SWAPNGO_STATE) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.trunc((tax / 2) * 100) / 100;
  return { cgst, sgst: Math.round((tax - cgst) * 100) / 100, igst: 0 };
}

/**
 * Purchases & input tax credit (GST Stage 4).
 *
 * Every vendor bill is entered once, with its photo or PDF, as lines tagged
 * claimable, blocked or "review"; matched against GSTR-2B; and linked to the
 * bank payment that paid it. ITC is claimed only from confirmed bills, only
 * for claimable lines, and only once the supplier's 2B shows them.
 */
export default function PurchasesPage() {
  usePageSubtitle("Vendor bills, input tax credit, GSTR-2B and the fleet's asset register.");
  const user = useAuthStore((s) => s.user);
  const can = { create: hasAction(user, "purchases", "create"), edit: hasAction(user, "purchases", "edit") };

  const months = useMemo(() => monthsSince(FIRST_MONTH), []);
  const [month, setMonth] = useState(months[0]);
  const [billDialog, setBillDialog] = useState<{ open: boolean; editId: string | null }>({ open: false, editId: null });
  const [openBill, setOpenBill] = useState<string | null>(null);

  const drafts = usePurchaseMutation(
    (m: string) => api.draftFromStatements(m),
    (r) => ({
      title: r.created.length ? "Bills drafted" : "Nothing new to draft",
      message: r.created.length ? `${r.created.length} draft bill(s) from Razorpay fees and HDFC charges — check each against its tax invoice.` : "Razorpay fees and HDFC charges for this month are already drafted, or there are none.",
    }),
  );

  return (
    <div className="animate-fade-in space-y-4">
      <Tabs defaultValue="bills">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="flex-wrap">
            <TabsTrigger value="bills">Bills</TabsTrigger>
            <TabsTrigger value="payables">Payables</TabsTrigger>
            <TabsTrigger value="itc">ITC &amp; GSTR-2B</TabsTrigger>
            <TabsTrigger value="vendors">Vendors</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Month"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
            {can.create && (
              <>
                <Button size="sm" variant="outline" disabled={drafts.isPending} onClick={() => drafts.mutate(month)}>
                  {drafts.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />} Draft Razorpay &amp; HDFC bills
                </Button>
                <Button size="sm" onClick={() => setBillDialog({ open: true, editId: null })}><Plus className="h-3.5 w-3.5" /> New bill</Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value="bills"><BillsTab month={month} onOpen={setOpenBill} /></TabsContent>
        <TabsContent value="payables"><PayablesTab onOpen={setOpenBill} /></TabsContent>
        <TabsContent value="itc" className="space-y-4"><ItcTab month={month} canEdit={can.edit} /></TabsContent>
        <TabsContent value="vendors"><VendorsTab canCreate={can.create} /></TabsContent>
        <TabsContent value="assets"><AssetsTab canEdit={can.edit} /></TabsContent>
      </Tabs>

      <BillDrawer
        id={openBill}
        can={can}
        onClose={() => setOpenBill(null)}
        onEdit={(id) => setBillDialog({ open: true, editId: id })}
      />
      <BillDialog
        open={billDialog.open}
        editId={billDialog.editId}
        onOpenChange={(o) => setBillDialog((s) => ({ ...s, open: o }))}
        onSaved={(id) => setOpenBill(id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

function BillsTab({ month, onOpen }: { month: string; onOpen: (id: string) => void }) {
  const { from, to } = monthRange(month);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [month]);
  const { data, isLoading, isError, refetch } = useBills({ from, to, status: status === "all" ? undefined : status, search: search.trim() || undefined, page, pageSize: 15 });

  const columns: DataTableColumn<Bill>[] = [
    { header: "Date", key: "billDate", render: (b) => formatDate(b.billDate) },
    {
      header: "Vendor", key: "vendorName",
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{b.vendorName}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{b.billNumber}</p>
        </div>
      ),
    },
    { header: "Taxable", key: "taxableAmount", className: "text-right", hideOnMobile: true, render: (b) => <span className="tabular-nums">{formatCurrency(b.taxableAmount)}</span> },
    { header: "GST", key: "gst", className: "text-right", hideOnMobile: true, render: (b) => <span className="tabular-nums">{formatCurrency(b.cgstAmount + b.sgstAmount + b.igstAmount)}</span> },
    { header: "Total", key: "totalAmount", className: "text-right", render: (b) => <span className="tabular-nums font-medium">{formatCurrency(b.totalAmount)}</span> },
    { header: "Status", key: "status", render: (b) => <BillStatus bill={b} /> },
    {
      header: "Paid", key: "paid", hideOnMobile: true,
      render: (b) => b.status !== "confirmed" ? <span className="text-muted-foreground">—</span>
        : b.paidAmount >= b.totalAmount - 0.009 ? <Badge variant="success">Paid</Badge>
          : <Badge variant="outline">{formatCurrency(b.totalAmount - b.paidAmount)} due</Badge>,
    },
  ];

  return (
    <Card className="flex min-h-[18rem] flex-col overflow-hidden">
      <FilterBar
        search={<SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search bill number" className="w-full sm:w-64" />}
        filters={
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <DataTable
        fill columns={columns} data={data?.data ?? []} isLoading={isLoading} isError={isError} onRetry={() => refetch()}
        onRowClick={(b) => onOpen(b.id)} emptyTitle="No bills" emptyDescription="No vendor bills dated in this month."
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
    </Card>
  );
}

function BillStatus({ bill }: { bill: Bill }) {
  if (bill.status === "draft") return <Badge variant="warning">Draft</Badge>;
  if (bill.status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant={bill.gstr2bStatus === "matched" || bill.gstr2bStatus === "not_applicable" ? "success" : "info"}>{TWO_B_LABEL[bill.gstr2bStatus] ?? bill.gstr2bStatus}</Badge>;
}

function BillDrawer({ id, can, onClose, onEdit }: {
  id: string | null; can: { create: boolean; edit: boolean }; onClose: () => void; onEdit: (id: string) => void;
}) {
  const { data: bill, isLoading } = useBill(id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [linking, setLinking] = useState(false);
  const candidates = usePaymentCandidates(linking ? id : null);

  const confirm = usePurchaseMutation((billId: string) => api.confirmBill(billId), () => ({ title: "Bill confirmed", message: "Its ITC now counts in the month set on it." }));
  const cancel = usePurchaseMutation(({ billId, why }: { billId: string; why: string }) => api.cancelBill(billId, why), () => ({ title: "Bill cancelled", message: "Enter a corrected bill if one replaces it." }));
  const upload = usePurchaseMutation(({ billId, file }: { billId: string; file: File }) => api.uploadBillFile(billId, file), () => ({ title: "File attached", message: "The bill's file is stored privately." }));
  const link = usePurchaseMutation(({ billId, lineId }: { billId: string; lineId: string }) => api.linkPayment(billId, lineId), () => ({ title: "Payment linked", message: "The bank payment now counts against this bill." }));
  const unlink = usePurchaseMutation(({ billId, lineId }: { billId: string; lineId: string }) => api.unlinkPayment(billId, lineId), () => ({ title: "Payment unlinked", message: "The bank line is free to link elsewhere." }));

  useEffect(() => { setCancelling(false); setReason(""); setLinking(false); }, [id]);
  if (!id) return null;

  return (
    <SideDrawer open={!!id} onOpenChange={(o) => !o && onClose()} title={bill ? `${bill.vendorName} · ${bill.billNumber}` : "Bill"} className="sm:max-w-2xl">
      {isLoading || !bill ? <p className="mt-4 text-sm text-muted-foreground">Loading...</p> : (
        <div className="mt-4 space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <BillStatus bill={bill} />
            {bill.isReverseCharge && <Badge variant="info">Reverse charge</Badge>}
            {bill.source !== "manual" && <Badge variant="outline">Drafted from {bill.source === "razorpay_fees" ? "Razorpay" : "HDFC"}</Badge>}
          </div>
          {bill.notes && <p className="rounded-md bg-info/10 px-3 py-2 text-xs text-info">{bill.notes}</p>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label="Bill date" value={formatDate(bill.billDate)} />
            <Fact label="ITC month" value={bill.itcMonth ? monthLabel(bill.itcMonth.slice(0, 7)) : "—"} />
            <Fact label="Vendor GSTIN" value={bill.vendorGstin ?? "—"} mono />
          </dl>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>{["Line", "ITC", "Taxable", "GST", "Total"].map((h, i) => <th key={h} className={cn("px-3 py-2 font-medium text-muted-foreground", i > 1 ? "text-right" : "text-left")}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {bill.lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-3 py-2"><p className="font-medium">{l.description}</p><p className="text-muted-foreground">{l.categoryLabel} · {l.gstRate}%</p></td>
                    <td className="px-3 py-2"><Badge variant={ITC_BADGE[l.itcStatus].variant}>{ITC_BADGE[l.itcStatus].label}</Badge><p className="mt-1 max-w-[12rem] text-muted-foreground">{l.itcReason}</p></td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.taxableAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.igstAmount ? `IGST ${formatCurrency(l.igstAmount)}` : l.cgstAmount || l.sgstAmount ? `${formatCurrency(l.cgstAmount)} + ${formatCurrency(l.sgstAmount)}` : "—"}
                      {l.reverseChargeIgst > 0 && <p className="text-info">RCM IGST {formatCurrency(l.reverseChargeIgst)}</p>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.totalAmount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-medium">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(bill.taxableAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(bill.cgstAmount + bill.sgstAmount + bill.igstAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(bill.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Bill file</h4>
            <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ billId: bill.id, file: f }); e.target.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              {bill.hasFile && (
                <Button size="sm" variant="outline" onClick={() => api.billFileUrl(bill.id).then(({ url }) => window.open(url, "_blank", "noopener")).catch((e) => toastError(e, "Could not open the file"))}>
                  <FileText className="h-3.5 w-3.5" /> Open file
                </Button>
              )}
              {can.create && bill.status !== "cancelled" && (
                <Button size="sm" variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                  {upload.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} {bill.hasFile ? "Replace" : "Attach"} photo or PDF
                </Button>
              )}
            </div>
          </div>

          {bill.status === "confirmed" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Payments · {formatCurrency(bill.paidAmount)} of {formatCurrency(bill.totalAmount)}</h4>
                {can.edit && <Button size="sm" variant="ghost" onClick={() => setLinking((v) => !v)}><Link2 className="h-3.5 w-3.5" /> Link bank payment</Button>}
              </div>
              {bill.payments.length === 0 && !linking && <p className="text-xs text-muted-foreground">No bank payment linked yet.</p>}
              {bill.payments.map((p) => (
                <div key={p.lineId} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
                  <span className="min-w-0 truncate">{p.date && formatDate(p.date)} · {p.description}</span>
                  <span className="flex items-center gap-2 tabular-nums">{formatCurrency(p.amount)}
                    {can.edit && <Button size="sm" variant="ghost" aria-label="Unlink" onClick={() => unlink.mutate({ billId: bill.id, lineId: p.lineId })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </span>
                </div>
              ))}
              {linking && (
                candidates.isLoading ? <p className="text-xs text-muted-foreground">Loading bank lines...</p>
                  : !candidates.data?.length ? <p className="text-xs text-muted-foreground">No unlinked money-out lines dated on or after the bill. Import the bank statement first.</p>
                    : candidates.data.map((c) => (
                      <button key={c.id} type="button" onClick={() => { link.mutate({ billId: bill.id, lineId: c.id }); setLinking(false); }}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2 text-left text-xs hover:bg-secondary">
                        <span className="min-w-0 truncate">{c.date && formatDate(c.date)} · {c.counterparty ?? c.description}</span>
                        <span className="tabular-nums">{formatCurrency(c.amount)}</span>
                      </button>
                    ))
              )}
            </div>
          )}

          {bill.status === "cancelled" && bill.cancelReason && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs">Cancelled: {bill.cancelReason}</p>}

          {bill.status !== "cancelled" && (can.create || can.edit) && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {bill.status === "draft" && can.create && <Button size="sm" variant="outline" onClick={() => onEdit(bill.id)}>Edit draft</Button>}
              {bill.status === "draft" && can.edit && (
                <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate(bill.id)}>{confirm.isPending && <Spinner className="h-3.5 w-3.5" />} Confirm bill</Button>
              )}
              {can.edit && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelling(true)}>Cancel bill</Button>}
            </div>
          )}
          {cancelling && (
            <div className="space-y-2 rounded-md border border-destructive/30 p-3">
              <Label>Why is it cancelled?</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice; vendor issued a corrected invoice" />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setCancelling(false)}>Keep</Button>
                <Button size="sm" variant="destructive" disabled={reason.trim().length < 5 || cancel.isPending}
                  onClick={() => cancel.mutate({ billId: bill.id, why: reason.trim() }, { onSuccess: () => setCancelling(false) })}>Cancel bill</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SideDrawer>
  );
}

interface LineDraft { description: string; category: string; taxableAmount: string; gstRate: string; itcStatus: ItcStatus | ""; itcReason: string }
const emptyLine = (category = ""): LineDraft => ({ description: "", category, taxableAmount: "", gstRate: "18", itcStatus: "", itcReason: "" });

function BillDialog({ open, editId, onOpenChange, onSaved }: {
  open: boolean; editId: string | null; onOpenChange: (o: boolean) => void; onSaved: (id: string) => void;
}) {
  const vendors = useVendors();
  const categories = usePurchaseCategories();
  const existing = useBill(open ? editId : null);
  const [vendorId, setVendorId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [itcMonth, setItcMonth] = useState("");
  const [reverseCharge, setReverseCharge] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const save = usePurchaseMutation(
    (input: BillInput) => (editId ? api.updateBill(editId, input) : api.createBill(input)),
    () => ({ title: editId ? "Draft saved" : "Bill entered", message: "Saved as a draft. Attach its file and confirm it once checked." }),
    { inlineErrors: true },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    const b = existing.data;
    if (editId && b) {
      setVendorId(b.vendorId); setBillNumber(b.billNumber); setBillDate(b.billDate);
      setItcMonth(b.itcMonth?.slice(0, 7) ?? ""); setReverseCharge(b.isReverseCharge); setNotes(b.notes ?? "");
      setLines(b.lines.map((l) => ({ description: l.description, category: l.category, taxableAmount: String(l.taxableAmount), gstRate: String(l.gstRate), itcStatus: "", itcReason: "" })));
    } else if (!editId) {
      setVendorId(""); setBillNumber(""); setBillDate(""); setItcMonth(""); setReverseCharge(false); setNotes(""); setLines([emptyLine()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId, existing.data]);

  const vendor = vendors.data?.find((v) => v.id === vendorId) ?? null;
  useEffect(() => { if (vendor && !editId) setReverseCharge(vendor.kind === "foreign_software"); }, [vendor, editId]);

  const catByCode = new Map((categories.data ?? []).map((c) => [c.code, c]));
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const fields = save.error instanceof ApiError ? save.error.fields ?? {} : {};

  const parsed: BillLineInput[] = lines.map((l) => ({
    description: l.description.trim(), category: l.category, taxableAmount: Number(l.taxableAmount) || 0, gstRate: Number(l.gstRate) || 0,
    ...(l.itcStatus ? { itcStatus: l.itcStatus, itcReason: l.itcReason.trim() } : {}),
  }));
  const canSave = !!vendorId && !!billNumber.trim() && !!billDate
    && parsed.every((l) => l.description.length >= 2 && l.category && l.taxableAmount > 0);
  const total = parsed.reduce((t, l) => {
    const tax = previewTax(l.taxableAmount, l.gstRate, vendor?.stateCode ?? null, reverseCharge);
    return t + l.taxableAmount + tax.cgst + tax.sgst + tax.igst;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{editId ? "Edit draft bill" : "New vendor bill"}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor" error={fields.vendorId}>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
                <SelectContent>{(vendors.data ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}{v.gstin ? ` · ${v.gstin}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Vendor's invoice number" error={fields.billNumber}>
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
            </Field>
            <Field label="Invoice date" error={fields.billDate}><Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></Field>
            <Field label="ITC month (GSTR-3B that claims it)">
              <Input type="month" value={itcMonth} onChange={(e) => setItcMonth(e.target.value)} placeholder="Same as invoice month" />
            </Field>
          </div>
          {vendor && !vendor.gstin && !reverseCharge && (
            <p className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> This vendor has no GSTIN on file, so its GST cannot be matched in GSTR-2B. Add it on the Vendors tab.
            </p>
          )}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Reverse charge</p>
              <p className="text-xs text-muted-foreground">The vendor charged no Indian GST (overseas software, hosting). Swapngo pays IGST itself and claims it back.</p>
            </div>
            <Switch checked={reverseCharge} onCheckedChange={setReverseCharge} aria-label="Reverse charge" />
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Lines</h4>
            {lines.map((l, i) => {
              const cat = catByCode.get(l.category);
              const tax = previewTax(Number(l.taxableAmount) || 0, Number(l.gstRate) || 0, vendor?.stateCode ?? null, reverseCharge);
              return (
                <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
                    <Input placeholder="Description (as on the invoice)" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    <Select value={l.category} onValueChange={(v) => setLine(i, { category: v, itcStatus: "", itcReason: "" })}>
                      <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>{(categories.data ?? []).map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Input type="number" min={0} step="0.01" placeholder="Taxable value" value={l.taxableAmount} onChange={(e) => setLine(i, { taxableAmount: e.target.value })} />
                    <Select value={l.gstRate} onValueChange={(v) => setLine(i, { gstRate: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["0", "5", "12", "18", "28", "40"].map((r) => <SelectItem key={r} value={r}>{r}% GST</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="col-span-2 self-center text-xs text-muted-foreground tabular-nums">
                      {reverseCharge ? `Reverse charge IGST ${formatCurrency(Math.round((Number(l.taxableAmount) || 0) * (Number(l.gstRate) || 0)) / 100)}`
                        : tax.igst ? `IGST ${formatCurrency(tax.igst)}` : `CGST ${formatCurrency(tax.cgst)} + SGST ${formatCurrency(tax.sgst)}`}
                    </p>
                  </div>
                  {cat && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={ITC_BADGE[(l.itcStatus || cat.itc) as ItcStatus].variant}>{ITC_BADGE[(l.itcStatus || cat.itc) as ItcStatus].label}</Badge>
                      <span className="text-muted-foreground">{l.itcStatus ? "Overridden" : cat.basis}</span>
                      <Select value={l.itcStatus || "default"} onValueChange={(v) => setLine(i, { itcStatus: v === "default" ? "" : (v as ItcStatus) })}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Category default</SelectItem>
                          {(Object.keys(ITC_BADGE) as ItcStatus[]).filter((s) => s !== cat.itc).map((s) => <SelectItem key={s} value={s}>{ITC_BADGE[s].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {lines.length > 1 && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  )}
                  {l.itcStatus && <Input placeholder="Why the ITC status differs from the category (required)" value={l.itcReason} onChange={(e) => setLine(i, { itcReason: e.target.value })} />}
                </div>
              );
            })}
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine(vendor?.defaultCategory ?? "")])}><Plus className="h-3.5 w-3.5" /> Add line</Button>
          </div>

          <Field label="Notes (optional)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <p className="text-right text-sm font-medium tabular-nums">Total {formatCurrency(Math.round(total * 100) / 100)}</p>
          {save.error && !Object.keys(fields).length && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{save.error instanceof ApiError ? save.error.message : "Something went wrong."}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSave || save.isPending}
            onClick={() => save.mutate(
              { vendorId, billNumber: billNumber.trim(), billDate, itcMonth: itcMonth ? `${itcMonth}-01` : null, isReverseCharge: reverseCharge, notes: notes.trim() || null, lines: parsed },
              { onSuccess: (b) => { onOpenChange(false); onSaved(b.id); } },
            )}>
            {save.isPending && <Spinner className="h-4 w-4" />} Save draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payables
// ---------------------------------------------------------------------------

function PayablesTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading, isError, refetch } = usePayables();
  const total = (data ?? []).reduce((t, p) => t + p.outstanding, 0);
  const warnings = (data ?? []).filter((p) => p.rule37Warning).length;
  const columns: DataTableColumn<Payable>[] = [
    { header: "Vendor", key: "vendorName", render: (p) => <div className="min-w-0"><p className="truncate font-medium">{p.vendorName}</p><p className="truncate font-mono text-xs text-muted-foreground">{p.billNumber}</p></div> },
    { header: "Bill date", key: "billDate", render: (p) => formatDate(p.billDate) },
    { header: "Age", key: "ageDays", render: (p) => <span className={cn(p.ageDays >= 150 && "font-medium text-destructive")}>{p.ageDays} days</span> },
    { header: "Outstanding", key: "outstanding", className: "text-right", render: (p) => <span className="tabular-nums font-medium">{formatCurrency(p.outstanding)}</span> },
    { header: "", key: "warn", render: (p) => p.rule37Warning ? <Badge variant="destructive">Pay before 180 days</Badge> : null },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Unpaid bills" value={data?.length ?? 0} />
        <StatCard label="Outstanding" value={formatCurrency(total)} tone="warning" />
        <StatCard label="Near the 180-day limit" value={warnings} tone={warnings ? "destructive" : "success"} icon={AlertTriangle} />
      </div>
      <p className="text-xs text-muted-foreground">A bill whose ITC was claimed must be paid within 180 days of its date, or the ITC is reversed (Rule 37). Link the bank payment on the bill to clear it here.</p>
      <Card className="flex min-h-[14rem] flex-col overflow-hidden">
        <DataTable fill columns={columns} data={data ?? []} isLoading={isLoading} isError={isError} onRetry={() => refetch()}
          onRowClick={(p) => onOpen(p.id)} emptyTitle="Nothing outstanding" emptyDescription="Every confirmed bill has its bank payment linked." />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ITC & GSTR-2B
// ---------------------------------------------------------------------------

function ItcTab({ month, canEdit }: { month: string; canEdit: boolean }) {
  const { data: s, isError, refetch } = useItcSummary(month);
  const missing = useTwoBNotInBooks(month);
  const fileRef = useRef<HTMLInputElement>(null);
  const importer = usePurchaseMutation(
    (file: File) => api.importGstr2b(file, month),
    (r) => ({ title: "GSTR-2B imported", message: `${r.documents} documents: ${r.matched} matched, ${r.notInBooks} not in our books, ${r.awaiting} of our bills not in it yet.` }),
  );
  const heads = (h: { cgst: number; sgst: number; igst: number }) => formatCurrency(h.cgst + h.sgst + h.igst);

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Credit for {monthLabel(month)}: claimed only from confirmed bills set to this month, claimable lines only, and only once the supplier's GSTR-2B shows them.</p>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importer.mutate(f); e.target.value = ""; }} />
            <Button size="sm" disabled={importer.isPending} onClick={() => fileRef.current?.click()}>
              {importer.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />} Import GSTR-2B (JSON)
            </Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Claim this month" value={s ? heads(s.eligible) : "—"} tone="success" />
        <StatCard label={`Waiting for 2B${s?.awaiting2b.bills ? ` (${s.awaiting2b.bills})` : ""}`} value={s ? heads(s.awaiting2b) : "—"} tone="warning" />
        <StatCard label="Blocked, s. 17(5)" value={s ? heads(s.blocked) : "—"} tone="destructive" />
        <StatCard label={`Under review${s?.review.lines ? ` (${s.review.lines})` : ""}`} value={s ? heads(s.review) : "—"} tone="info" />
        <StatCard label="Reverse charge IGST" value={s ? formatCurrency(s.reverseCharge.igst) : "—"} tone="purple" />
      </div>
      {s && (
        <Card className="p-4 text-sm">
          <h3 className="font-semibold">Claimable credit by tax head</h3>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            <Fact label="IGST" value={formatCurrency(s.eligible.igst)} />
            <Fact label="CGST" value={formatCurrency(s.eligible.cgst)} />
            <Fact label="SGST" value={formatCurrency(s.eligible.sgst)} />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {s.billCount} confirmed bill{s.billCount === 1 ? "" : "s"} for this month
            {s.drafts > 0 && ` · ${s.drafts} draft${s.drafts === 1 ? "" : "s"} not counted until confirmed`}
            {s.reverseCharge.bills > 0 && ` · reverse charge: ${formatCurrency(s.reverseCharge.taxable)} taxable, the IGST above is paid in cash (3B 3.1(d)) and claimed back (4A(3))`}.
          </p>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">In GSTR-2B, not in our books</h3>
          <p className="text-xs text-muted-foreground">A supplier billed Swapngo and filed it, but no bill is entered — a missing expense and unclaimed credit. Enter the bill.</p>
        </div>
        {!missing.data?.length ? <EmptyState title="Nothing missing" description="Import this month's GSTR-2B to check." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40"><tr>{["Supplier", "GSTIN", "Number", "Date", "Taxable", "GST"].map((h, i) => <th key={h} className={cn("px-4 py-2 font-medium text-muted-foreground", i > 3 ? "text-right" : "text-left")}>{h}</th>)}</tr></thead>
              <tbody>
                {missing.data.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2">{m.supplier}</td><td className="px-4 py-2 font-mono text-xs">{m.gstin}</td>
                    <td className="px-4 py-2 font-mono text-xs">{m.number}</td><td className="px-4 py-2">{m.date ? formatDate(m.date) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.taxable)}</td><td className="px-4 py-2 text-right tabular-nums">{formatCurrency(m.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

function VendorsTab({ canCreate }: { canCreate: boolean }) {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, refetch } = useVendors(search.trim() || undefined);
  const [editing, setEditing] = useState<Vendor | null | "new">(null);
  const columns: DataTableColumn<Vendor>[] = [
    { header: "Vendor", key: "name", render: (v) => <span className="font-medium">{v.name}</span> },
    { header: "GSTIN", key: "gstin", render: (v) => (v.gstin ? <span className="font-mono text-xs">{v.gstin}</span> : <Badge variant="warning">No GSTIN</Badge>) },
    { header: "Kind", key: "kind", hideOnMobile: true, render: (v) => <span className="text-xs">{VENDOR_KIND[v.kind] ?? v.kind}</span> },
    { header: "State", key: "stateCode", hideOnMobile: true, render: (v) => v.stateCode ?? "—" },
  ];
  return (
    <Card className="flex min-h-[18rem] flex-col overflow-hidden">
      <FilterBar
        search={<SearchBar value={search} onChange={setSearch} placeholder="Search name or GSTIN" className="w-full sm:w-64" />}
        trailing={canCreate ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-3.5 w-3.5" /> New vendor</Button> : undefined}
      />
      <DataTable fill columns={columns} data={data ?? []} isLoading={isLoading} isError={isError} onRetry={() => refetch()}
        onRowClick={canCreate ? (v) => setEditing(v) : undefined} emptyTitle="No vendors" />
      <VendorDialog vendor={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function VendorDialog({ vendor, onClose }: { vendor: Vendor | null | "new"; onClose: () => void }) {
  const categories = usePurchaseCategories();
  const isNew = vendor === "new";
  const base = vendor && vendor !== "new" ? vendor : null;
  const [form, setForm] = useState<VendorInput>({ name: "", kind: "goods" });
  const save = usePurchaseMutation(
    (input: VendorInput) => (base ? api.updateVendor(base.id, input) : api.createVendor(input)),
    (v) => ({ title: "Vendor saved", message: v.name }),
    { inlineErrors: true },
  );
  useEffect(() => {
    if (!vendor) return;
    save.reset();
    setForm(base ? {
      name: base.name, gstin: base.gstin, pan: base.pan, stateCode: base.stateCode, address: base.address, kind: base.kind,
      defaultCategory: base.defaultCategory, contactEmail: base.contactEmail, contactPhone: base.contactPhone,
    } : { name: "", kind: "goods" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor]);
  if (!vendor) return null;
  const set = <K extends keyof VendorInput>(k: K, v: VendorInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fields = save.error instanceof ApiError ? save.error.fields ?? {} : {};
  return (
    <Dialog open={!!vendor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isNew ? "New vendor" : "Edit vendor"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Name" error={fields.name}><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="GSTIN" error={fields.gstin}><Input className="font-mono uppercase" maxLength={15} value={form.gstin ?? ""} onChange={(e) => set("gstin", e.target.value.toUpperCase())} /></Field>
            <Field label="Kind">
              <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(VENDOR_KIND).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Default category">
            <Select value={form.defaultCategory ?? "none"} onValueChange={(v) => set("defaultCategory", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(categories.data ?? []).map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Address"><Textarea rows={2} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" error={fields.contactEmail}><Input value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} /></Field>
            <Field label="Phone"><Input value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} /></Field>
          </div>
          {save.error && !Object.keys(fields).length && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{save.error instanceof ApiError ? save.error.message : "Something went wrong."}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={form.name.trim().length < 2 || save.isPending}
            onClick={() => save.mutate({ ...form, contactEmail: form.contactEmail || null, gstin: form.gstin?.trim() || null }, { onSuccess: onClose })}>
            {save.isPending && <Spinner className="h-4 w-4" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

function AssetsTab({ canEdit }: { canEdit: boolean }) {
  const [rate, setRate] = useState(15);
  const { data, isLoading, isError, refetch } = useAssets(rate);
  const [editing, setEditing] = useState<Asset | null>(null);
  const costTotal = (data ?? []).reduce((t, a) => t + (a.cost ?? 0), 0);
  const wdvTotal = (data ?? []).reduce((t, a) => t + (a.writtenDownValue ?? 0), 0);
  const missing = (data ?? []).filter((a) => a.cost == null).length;
  const columns: DataTableColumn<Asset & { id: string }>[] = [
    { header: "Scooter", key: "registrationNumber", render: (a) => <div><p className="font-mono text-xs font-medium">{a.registrationNumber}</p><p className="text-xs text-muted-foreground">{a.model}</p></div> },
    { header: "Purchased", key: "purchasedOn", render: (a) => (a.purchasedOn ? formatDate(a.purchasedOn) : "—") },
    { header: "Bill", key: "billNumber", hideOnMobile: true, render: (a) => <span className="font-mono text-xs">{a.billNumber ?? "—"}</span> },
    { header: "Cost", key: "cost", className: "text-right", render: (a) => (a.cost != null ? <span className="tabular-nums">{formatCurrency(a.cost)}</span> : <Badge variant="warning">Not set</Badge>) },
    { header: "Written-down value", key: "wdv", className: "text-right", render: (a) => (a.writtenDownValue != null ? <span className="tabular-nums">{formatCurrency(a.writtenDownValue)}</span> : "—") },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Depreciation rate (%)</Label>
          <Input type="number" min={0} max={100} value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} className="w-32" />
        </div>
        <p className="max-w-xl text-xs text-muted-foreground">Written-down value at the end of the current financial year: half the rate in a year a scooter was used under 180 days. The rate is your CA's decision — it is not saved. Cost includes GST that could not be claimed.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Cost of the fleet" value={formatCurrency(costTotal)} />
        <StatCard label="Written-down value" value={formatCurrency(wdvTotal)} tone="info" />
        <StatCard label="Cost not set" value={missing} tone={missing ? "warning" : "success"} />
      </div>
      <Card className="flex min-h-[14rem] flex-col overflow-hidden">
        <DataTable fill columns={columns} data={(data ?? []).map((a) => ({ ...a, id: a.vehicleId }))} isLoading={isLoading} isError={isError}
          onRetry={() => refetch()} onRowClick={canEdit ? (a) => setEditing(a) : undefined} emptyTitle="No scooters" />
      </Card>
      <CostDialog asset={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CostDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const [cost, setCost] = useState("");
  const [purchasedOn, setPurchasedOn] = useState("");
  const save = usePurchaseMutation(
    (a: { id: string; cost: number; purchasedOn: string | null }) => api.setVehicleCost(a.id, { billLineId: null, cost: a.cost, purchasedOn: a.purchasedOn }),
    () => ({ title: "Cost saved", message: "The asset register now uses it." }),
  );
  useEffect(() => { setCost(asset?.cost != null ? String(asset.cost) : ""); setPurchasedOn(asset?.purchasedOn ?? ""); }, [asset]);
  if (!asset) return null;
  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{asset.registrationNumber}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Cost, including GST that cannot be claimed"><Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
          <Field label="Purchased on"><Input type="date" value={purchasedOn} onChange={(e) => setPurchasedOn(e.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!(Number(cost) > 0) || save.isPending}
            onClick={() => save.mutate({ id: asset.vehicleId, cost: Number(cost), purchasedOn: purchasedOn || null }, { onSuccess: onClose })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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
