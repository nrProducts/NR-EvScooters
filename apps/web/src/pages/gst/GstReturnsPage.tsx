import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Download, FileArchive, FileCheck, FileJson, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatCard } from "@/components/common/StatCard";
import { Spinner } from "@/components/common/Spinner";
import { ErrorState } from "@/components/common/ErrorState";
import { EmptyState } from "@/components/common/EmptyState";
import { useReturnPeriods, useReturnWorksheet, useUpdateReturnStatus } from "@/hooks/useGst";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { useAuthStore } from "@/store/authStore";
import { hasAction } from "@/lib/permissions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import {
  downloadAuditorPack, downloadGstr1Json, downloadReturnWorksheet,
  type ReturnPeriod, type ReturnState, type ReturnStatus, type ReturnWorksheet,
} from "@/services/api/gst";

type ReturnKind = "gstr1" | "gstr3b";

const RETURN_LABEL: Record<ReturnKind, string> = { gstr1: "GSTR-1", gstr3b: "GSTR-3B" };

const STATUS_LABEL: Record<ReturnStatus, string> = {
  not_started: "Not started",
  ready: "Ready",
  sent: "Sent to Taxkey",
  filed: "Filed",
};

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));

function StatusBadge({ state }: { state: ReturnState }) {
  if (state.status === "filed") return <Badge variant="success">Filed</Badge>;
  if (state.overdueDays > 0) return <Badge variant="destructive">{STATUS_LABEL[state.status]} · {state.overdueDays}d late</Badge>;
  if (state.status === "not_started") return <Badge variant="muted">Not started</Badge>;
  return <Badge variant="info">{STATUS_LABEL[state.status]}</Badge>;
}

/**
 * Monthly GST returns — GSTR-1 by the 11th, GSTR-3B by the 20th.
 *
 * Every figure is computed from the tax documents reported in the month and
 * the purchase bills claimed in it; nothing here is typed in except what the
 * portal gives back after filing (ARN, date, challan). Marking GSTR-3B filed
 * freezes the month: its tax documents and purchase bills can no longer move.
 */
export default function GstReturnsPage() {
  usePageSubtitle("Monthly GSTR-1 and GSTR-3B worksheets, readiness checks and the filing pack for the accountant.");

  const user = useAuthStore((s) => s.user);
  const canFile = hasAction(user, "gst", "file");

  const periods = useReturnPeriods();
  const [month, setMonth] = useState<string | null>(null);
  useEffect(() => {
    if (!month && periods.data?.length) setMonth(periods.data[0].month);
  }, [periods.data, month]);

  const [busy, setBusy] = useState<null | "xlsx" | "json" | "pack">(null);
  const run = async (kind: "xlsx" | "json" | "pack") => {
    if (!month) return;
    setBusy(kind);
    try {
      if (kind === "xlsx") await downloadReturnWorksheet(month);
      else if (kind === "json") await downloadGstr1Json(month);
      else await downloadAuditorPack(month);
    } catch (err) {
      toastError(err, "Download failed");
    } finally {
      setBusy(null);
    }
  };

  if (periods.isError) return <ErrorState onRetry={() => periods.refetch()} />;
  if (periods.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!periods.data?.length) {
    return (
      <EmptyState
        title="No returns yet"
        description="The first return is for September 2026, the month GST registration took effect. It appears here once that month has ended."
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Select value={month ?? undefined} onValueChange={setMonth}>
          <SelectTrigger className="w-full sm:w-56" aria-label="Return month"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periods.data.map((p) => <SelectItem key={p.month} value={p.month}>{monthLabel(p.month)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex">
          <Button size="sm" className="rounded-r-none" disabled={!!busy || !month} onClick={() => void run("pack")}>
            {busy === "pack" ? <Spinner className="h-3.5 w-3.5" /> : <FileArchive className="h-3.5 w-3.5" />} Download filing pack
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-l-none border-l border-primary-foreground/20 px-2" aria-label="More downloads" disabled={!!busy || !month}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void run("pack")}>
                <FileArchive className="mr-2 h-3.5 w-3.5" /> Filing pack for Taxkey (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void run("xlsx")}>
                <Download className="mr-2 h-3.5 w-3.5" /> Worksheet — Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void run("json")}>
                <FileJson className="mr-2 h-3.5 w-3.5" /> GSTR-1 for the offline tool (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {month && <MonthView month={month} canFile={canFile} />}
      <PeriodsTable periods={periods.data} selected={month} onSelect={setMonth} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function MonthView({ month, canFile }: { month: string; canFile: boolean }) {
  const { data: ws, isLoading, isError, refetch } = useReturnWorksheet(month);
  const [dialog, setDialog] = useState<ReturnKind | null>(null);

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !ws) return <p className="text-sm text-muted-foreground">Building the worksheet...</p>;

  const g = ws.gstr3b;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Taxable value (net)" value={formatCurrency(g.outward.taxable)} icon={FileCheck} tone="info" />
        <StatCard label="Output tax" value={formatCurrency(g.outward.cgst + g.outward.sgst)} tone="default" />
        <StatCard label="Input tax credit" value={formatCurrency(g.itc.eligible.igst + g.itc.eligible.cgst + g.itc.eligible.sgst)} tone="success" />
        <StatCard label="Cash to pay" value={formatCurrency(g.setOff.cash.total)} tone={g.setOff.cash.total > 0 ? "warning" : "success"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReturnCard kind="gstr1" ws={ws} canFile={canFile} onFile={() => setDialog("gstr1")} />
        <ReturnCard kind="gstr3b" ws={ws} canFile={canFile} onFile={() => setDialog("gstr3b")} />
        <ChecksCard ws={ws} />
      </div>

      <Tabs defaultValue="gstr1">
        <TabsList>
          <TabsTrigger value="gstr1">GSTR-1</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B</TabsTrigger>
        </TabsList>
        <TabsContent value="gstr1"><Gstr1Tables ws={ws} /></TabsContent>
        <TabsContent value="gstr3b"><Gstr3bTables ws={ws} /></TabsContent>
      </Tabs>

      <FiledDialog month={month} kind={dialog} ws={ws} onClose={() => setDialog(null)} />
    </div>
  );
}

function ReturnCard({ kind, ws, canFile, onFile }: { kind: ReturnKind; ws: ReturnWorksheet; canFile: boolean; onFile: () => void }) {
  const state = ws.status[kind];
  const update = useUpdateReturnStatus(ws.month);
  const filed = state.status === "filed";
  // GSTR-3B is filed after GSTR-1; the backend refuses it otherwise.
  const blocked = kind === "gstr3b" && ws.status.gstr1.status !== "filed";

  const setStatus = (status: ReturnStatus) =>
    update.mutate({ return: kind, status }, { onError: (err) => toastError(err, "Could not update the return") });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{RETURN_LABEL[kind]}</h3>
        <StatusBadge state={state} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Due</dt><dd className="font-medium">{formatDate(state.dueOn)}</dd></div>
        {filed && <div><dt className="text-xs text-muted-foreground">Filed on</dt><dd className="font-medium">{state.filedOn ? formatDate(state.filedOn) : "—"}</dd></div>}
        {filed && (
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted-foreground">ARN</dt>
            <dd className="truncate font-mono text-xs font-medium">{state.arn}</dd>
          </div>
        )}
        {filed && kind === "gstr3b" && ws.status.taxPaidCash != null && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Paid in cash</dt>
            <dd className="font-medium">
              {formatCurrency(ws.status.taxPaidCash)}{ws.status.challanCpin && <span className="ml-1 font-mono text-xs text-muted-foreground">CPIN {ws.status.challanCpin}</span>}
            </dd>
          </div>
        )}
      </dl>
      {canFile && !filed && (
        <div className="mt-auto flex flex-wrap gap-2">
          {state.status !== "ready" && (
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setStatus("ready")}>Mark ready</Button>
          )}
          {state.status !== "sent" && (
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setStatus("sent")}>Sent to Taxkey</Button>
          )}
          <Button size="sm" disabled={update.isPending || blocked} onClick={onFile} title={blocked ? "Mark GSTR-1 filed first" : undefined}>
            Mark filed
          </Button>
        </div>
      )}
      {canFile && !filed && blocked && <p className="text-xs text-muted-foreground">GSTR-3B is marked filed after GSTR-1.</p>}
      {filed && kind === "gstr3b" && (
        <p className="text-xs text-muted-foreground">The month is locked: its tax documents and purchase bills can no longer move.</p>
      )}
    </Card>
  );
}

function ChecksCard({ ws }: { ws: ReturnWorksheet }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Before filing</h3>
        {ws.ready ? <Badge variant="success">All clear</Badge> : <Badge variant="warning">{ws.checks.filter((c) => !c.ok).length} to do</Badge>}
      </div>
      <ul className="mt-3 space-y-2.5">
        {ws.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-sm">
            {c.ok
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
            <div className="min-w-0">
              <p className="font-medium leading-tight">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function SimpleTable({ head, rows, total }: { head: string[]; rows: React.ReactNode[][]; total?: React.ReactNode[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("px-4 py-2 font-medium text-muted-foreground", i === 0 ? "text-left" : "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="border-t border-border"><td colSpan={head.length} className="px-4 py-3 text-muted-foreground">Nothing this month.</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => <td key={j} className={cn("px-4 py-2", j === 0 ? "text-left" : "text-right tabular-nums")}>{c}</td>)}
            </tr>
          ))}
          {total && (
            <tr className="border-t border-border font-medium">
              {total.map((c, j) => <td key={j} className={cn("px-4 py-2", j === 0 ? "text-left" : "text-right tabular-nums")}>{c}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

const money = (n: number) => formatCurrency(n);

function Gstr1Tables({ ws }: { ws: ReturnWorksheet }) {
  return (
    <div className="space-y-4">
      <Section title="Table 7 — B2C (others)" hint="Every rider is unregistered and in Tamil Nadu, so all supplies are intra-state B2C. Net of credit notes.">
        <SimpleTable
          head={["Place of supply", "Rate", "Taxable value", "CGST", "SGST"]}
          rows={ws.gstr1.table7.map((r) => [`Tamil Nadu (${r.placeOfSupply})`, `${r.rate}%`, money(r.taxable), money(r.cgst), money(r.sgst)])}
        />
      </Section>
      <Section title="Table 12 — HSN/SAC summary (B2C)">
        <SimpleTable
          head={["SAC", "Rate", "Taxable value", "CGST", "SGST", "Total"]}
          rows={ws.gstr1.table12.map((r) => [r.sac, `${r.rate}%`, money(r.taxable), money(r.cgst), money(r.sgst), money(r.total)])}
        />
      </Section>
      <Section title="Table 13 — documents issued">
        <SimpleTable
          head={["Nature", "From", "To", "Total", "Cancelled", "Net issued"]}
          rows={ws.gstr1.table13.map((t) => [
            t.nature,
            <span className="font-mono text-xs">{t.from ?? "—"}</span>,
            <span className="font-mono text-xs">{t.to ?? "—"}</span>,
            t.total, t.cancelled, t.net,
          ])}
        />
      </Section>
    </div>
  );
}

function Gstr3bTables({ ws }: { ws: ReturnWorksheet }) {
  const g = ws.gstr3b;
  const itc = g.itc;
  const s = g.setOff;
  return (
    <div className="space-y-4">
      <Section title="3.1 — Outward supplies and reverse charge">
        <SimpleTable
          head={["", "Taxable value", "IGST", "CGST", "SGST"]}
          rows={[
            ["3.1(a) Outward taxable supplies (net of credit notes)", money(g.outward.taxable), money(g.outward.igst), money(g.outward.cgst), money(g.outward.sgst)],
            ["3.1(d) Inward supplies on reverse charge", money(g.reverseCharge.taxable), money(g.reverseCharge.igst), money(0), money(0)],
          ]}
        />
      </Section>
      <Section title="4 — Input tax credit" hint="Claimed only when the supplier's invoice is in GSTR-2B. Credit on motor vehicles and other s. 17(5) items is shown and reversed.">
        <SimpleTable
          head={["", "IGST", "CGST", "SGST"]}
          rows={[
            ["4A(3) Reverse charge, claimed back", money(itc.reverseCharge.igst), money(0), money(0)],
            ["4A(5) All other ITC (in GSTR-2B)", money(itc.eligible.igst - itc.reverseCharge.igst), money(itc.eligible.cgst), money(itc.eligible.sgst)],
            ["4B(1) Reversed — blocked under s. 17(5)", money(itc.blocked.igst), money(itc.blocked.cgst), money(itc.blocked.sgst)],
            [`Not claimed — awaiting the supplier's GSTR-2B (${itc.awaiting2b.bills} bill${itc.awaiting2b.bills === 1 ? "" : "s"})`, money(itc.awaiting2b.igst), money(itc.awaiting2b.cgst), money(itc.awaiting2b.sgst)],
            [`Not claimed — under review (${itc.review.lines} line${itc.review.lines === 1 ? "" : "s"})`, money(itc.review.igst), money(itc.review.cgst), money(itc.review.sgst)],
          ]}
          total={["Net ITC available", money(itc.eligible.igst), money(itc.eligible.cgst), money(itc.eligible.sgst)]}
        />
      </Section>
      <Section title="6 — Payment of tax" hint="Reverse-charge tax is paid in cash. IGST credit is used first, against CGST then SGST (Rule 88A).">
        <SimpleTable
          head={["", "IGST", "CGST", "SGST"]}
          rows={[
            ["Tax payable", money(s.liability.igst), money(s.liability.cgst), money(s.liability.sgst)],
            ["Paid by IGST credit", money(0), money(s.creditUsed.igstAgainstCgst), money(s.creditUsed.igstAgainstSgst)],
            ["Paid by CGST / SGST credit", money(0), money(s.creditUsed.cgstAgainstCgst), money(s.creditUsed.sgstAgainstSgst)],
            ["Credit carried forward", money(s.creditCarriedForward.igst), money(s.creditCarriedForward.cgst), money(s.creditCarriedForward.sgst)],
          ]}
          total={[`Cash to pay — ${money(s.cash.total)}`, money(s.cash.igst), money(s.cash.cgst), money(s.cash.sgst)]}
        />
        {g.lateEstimate.daysLate > 0 && (
          <p className="border-t border-border bg-warning/10 px-4 py-3 text-xs text-warning">
            If filed today: {g.lateEstimate.daysLate} day{g.lateEstimate.daysLate === 1 ? "" : "s"} late — about {money(g.lateEstimate.interest)} interest (18% a year on the cash part)
            and {money(g.lateEstimate.lateFee)} late fee. Estimates; the portal computes the exact amount.
          </p>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PeriodsTable({ periods, selected, onSelect }: { periods: ReturnPeriod[]; selected: string | null; onSelect: (m: string) => void }) {
  return (
    <Section title="All months">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              {["Month", "GSTR-1", "GSTR-3B", "Cash paid"].map((h, i) => (
                <th key={h} className={cn("px-4 py-2 font-medium text-muted-foreground", i === 3 ? "text-right" : "text-left")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr
                key={p.month}
                className={cn("cursor-pointer border-t border-border hover:bg-muted/40", p.month === selected && "bg-muted/30")}
                onClick={() => onSelect(p.month)}
              >
                <td className="px-4 py-2 font-medium">{monthLabel(p.month)}</td>
                <td className="px-4 py-2"><StatusBadge state={p.gstr1} /></td>
                <td className="px-4 py-2"><StatusBadge state={p.gstr3b} /></td>
                <td className="px-4 py-2 text-right tabular-nums">{p.taxPaidCash == null ? "—" : formatCurrency(p.taxPaidCash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

interface FiledForm { arn: string; filedOn: string; taxPaidCash: string; challanCpin: string; interestPaid: string; lateFeePaid: string }

function FiledDialog({ month, kind, ws, onClose }: { month: string; kind: ReturnKind | null; ws: ReturnWorksheet; onClose: () => void }) {
  const update = useUpdateReturnStatus(month);
  const blank = (): FiledForm => ({
    arn: "", filedOn: "", taxPaidCash: String(ws.gstr3b.setOff.cash.total), challanCpin: "", interestPaid: "", lateFeePaid: "",
  });
  const [form, setForm] = useState<FiledForm>(blank);

  useEffect(() => {
    if (kind) { setForm(blank()); update.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const set = (k: keyof FiledForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const fields = update.error instanceof ApiError ? update.error.fields ?? {} : {};
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const canSubmit = form.arn.trim().length >= 5 && !!form.filedOn;

  return (
    <Dialog open={!!kind} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark {kind ? RETURN_LABEL[kind] : ""} filed — {monthLabel(month)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            Enter what the GST portal shows after filing. The worksheet is frozen with it and a filed return cannot change.
            {kind === "gstr3b" && " Filing GSTR-3B also locks the month's tax documents and purchase bills."}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="ARN" error={fields.arn}>
              <Input value={form.arn} className="font-mono uppercase" maxLength={30} onChange={(e) => set("arn", e.target.value.toUpperCase())} />
            </FormField>
            <FormField label="Filed on" error={fields.filedOn}>
              <Input type="date" value={form.filedOn} onChange={(e) => set("filedOn", e.target.value)} />
            </FormField>
          </div>
          {kind === "gstr3b" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Tax paid in cash (₹)" error={fields.taxPaidCash}>
                  <Input type="number" min={0} step={0.01} value={form.taxPaidCash} onChange={(e) => set("taxPaidCash", e.target.value)} />
                </FormField>
                <FormField label="Challan CPIN" error={fields.challanCpin}>
                  <Input value={form.challanCpin} className="font-mono" maxLength={30} onChange={(e) => set("challanCpin", e.target.value)} />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Interest paid (₹)" error={fields.interestPaid}>
                  <Input type="number" min={0} step={0.01} value={form.interestPaid} onChange={(e) => set("interestPaid", e.target.value)} />
                </FormField>
                <FormField label="Late fee paid (₹)" error={fields.lateFeePaid}>
                  <Input type="number" min={0} step={0.01} value={form.lateFeePaid} onChange={(e) => set("lateFeePaid", e.target.value)} />
                </FormField>
              </div>
            </>
          )}

          {update.error && !Object.keys(fields).length && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {update.error instanceof ApiError ? update.error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSubmit || update.isPending || !kind}
            onClick={() => kind && update.mutate(
              {
                return: kind, status: "filed", arn: form.arn.trim(), filedOn: form.filedOn,
                ...(kind === "gstr3b" ? {
                  taxPaidCash: num(form.taxPaidCash), challanCpin: form.challanCpin.trim() || null,
                  interestPaid: num(form.interestPaid), lateFeePaid: num(form.lateFeePaid),
                } : {}),
              },
              { onSuccess: onClose },
            )}
          >
            {update.isPending && <Spinner className="h-4 w-4" />} Mark filed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
