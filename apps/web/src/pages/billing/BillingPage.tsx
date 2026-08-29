import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Power, PowerOff, PlusCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import {
  useCancelRiderDiscount, useChargeRules, useCreateChargeRule, useCreateDiscountRule, useDeleteChargeRule,
  useDeleteDiscountRule, useDiscountRules, useRiderCharges, useRiderDiscounts, useUpdateChargeRule,
  useUpdateDiscountRule, useWaiveRiderCharge,
} from "@/hooks/useBilling";
import { useCancellationTiers, useReplaceCancellationTiers } from "@/hooks/useCancellationTiers";
import { useReturnRecoverySettings, useUpdateReturnRecoverySettings } from "@/hooks/useReturnRecoverySettings";
import { useVehicles } from "@/hooks/useVehicles";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { ApiError } from "@/services/api/httpClient";
import {
  CHARGE_CODE_LABELS, CHARGE_CODES, chargeCodeLabel, CHARGE_FREQUENCY_LABELS,
  DISCOUNT_CODE_LABELS, DISCOUNT_CODES, discountCodeLabel,
  DISCOUNT_FREQUENCY_LABELS,
  type ChargeAmountType, type ChargeCode, type ChargeFrequencyType, type ChargeRule, type ChargeRuleScope,
  type DiscountCode, type DiscountFrequencyType, type DiscountRule, type RiderCharge, type RiderChargeStatus,
  type RiderDiscount, type RiderDiscountStatus,
} from "@/types";

const CHARGE_RULE_STATUS_OPTIONS: ("all" | "active" | "inactive")[] = ["all", "active", "inactive"];
const CHARGE_RULE_SCOPE_OPTIONS: (ChargeRuleScope | "all")[] = ["all", "global", "vehicle"];
const RIDER_CHARGE_STATUS_OPTIONS: (RiderChargeStatus | "all")[] = [
  "all", "pending", "invoiced", "paid", "waived", "cancelled",
];
const RIDER_DISCOUNT_STATUS_OPTIONS: (RiderDiscountStatus | "all")[] = ["all", "pending", "applied", "cancelled"];

type BillingTab = "rules" | "cancellation" | "charges" | "discountRules" | "discounts";

export default function BillingPage() {
  const [tab, setTab] = useState<BillingTab>("rules");

  usePageSubtitle("Charge rules, the cancellation policy, and everything that's been applied.");

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={tab} onValueChange={(v) => setTab(v as BillingTab)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="rules">Charge Rules</TabsTrigger>
          <TabsTrigger value="cancellation">Cancellation Policy</TabsTrigger>
          <TabsTrigger value="charges">Rider Charges</TabsTrigger>
          <TabsTrigger value="discountRules">Discount Rules</TabsTrigger>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "rules" && <ChargeRulesTab />}
      {tab === "cancellation" && <CancellationTiersTab />}
      {tab === "charges" && <RiderChargesTab />}
      {tab === "discountRules" && <DiscountRulesTab />}
      {tab === "discounts" && <DiscountsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancellation Policy — time slabs. `cancellation_tiers`: a cancellation at
// N minutes after the booking was created keeps back the first tier's
// penalty_percent of the plan amount paid; past the last tier, 100% is kept.
// The deposit is always refunded in full.
// ---------------------------------------------------------------------------

/**
 * The late-fee RATE and its on/off are edited directly on the "Late fee"
 * charge rule row below (pencil = amount, power icon = enable/disable). The
 * only piece with no charge-rule home is the physical-recovery day cap, so
 * it lives here as a one-line control instead of its own card.
 */
function VehicleRecoveryNote() {
  const { data } = useReturnRecoverySettings();
  const update = useUpdateReturnRecoverySettings();
  const [days, setDays] = useState("");

  useEffect(() => { if (data) setDays(String(data.max_late_fee_days)); }, [data]);
  if (!data) return null;

  const n = Number(days);
  const invalid = !Number.isInteger(n) || n < 1;
  const dirty = n !== data.max_late_fee_days;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-sm">
      <span className="text-muted-foreground">Flag a scooter for physical recovery once it&apos;s</span>
      <Input
        type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)}
        className="h-8 w-20"
      />
      <span className="text-muted-foreground">days past its return date. Current late-fee rate: <span className="font-medium text-foreground">{formatCurrency(data.late_fee_per_day)}/day</span> (edit on the &ldquo;Late fee&rdquo; rule below).</span>
      <Button
        size="sm" variant="outline" disabled={!dirty || invalid || update.isPending}
        onClick={() => update.mutate({ max_late_fee_days: n }, {
          onSuccess: () => toastSuccess("Recovery day cap saved"),
          onError: (err) => toastError(err, "Could not save"),
        })}
      >
        {update.isPending ? "Saving…" : "Save"}
      </Button>
      {invalid && <span className="text-xs text-destructive">Enter a whole number ≥ 1.</span>}
    </div>
  );
}

interface TierDraft { upto_minutes: string; penalty_percent: string }

function CancellationTiersTab() {
  const { data, isLoading, isError, refetch } = useCancellationTiers();
  const save = useReplaceCancellationTiers();

  const [rows, setRows] = useState<TierDraft[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setRows(data.map((t) => ({ upto_minutes: String(t.upto_minutes), penalty_percent: String(t.penalty_percent) })));
  }, [data]);

  if (isLoading) return <Card className="p-4"><p className="text-sm text-muted-foreground">Loading cancellation policy…</p></Card>;
  if (isError) return <Card className="p-4"><p className="text-sm text-destructive">Couldn&apos;t load the cancellation policy. <button className="underline" onClick={() => refetch()}>Retry</button></p></Card>;

  const parsed = rows.map((r) => ({ upto_minutes: Number(r.upto_minutes), penalty_percent: Number(r.penalty_percent) }));
  const sorted = [...parsed].sort((a, b) => a.upto_minutes - b.upto_minutes);
  const minutesSet = new Set(parsed.map((p) => p.upto_minutes));
  const invalid = parsed.some((p) =>
    !Number.isInteger(p.upto_minutes) || p.upto_minutes < 1 ||
    Number.isNaN(p.penalty_percent) || p.penalty_percent < 0 || p.penalty_percent > 100,
  ) || minutesSet.size !== parsed.length;

  const addRow = () => {
    const lastMin = sorted.length ? sorted[sorted.length - 1].upto_minutes : 0;
    setRows((rs) => [...rs, { upto_minutes: String(lastMin + 30), penalty_percent: "75" }]);
  };
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const patchRow = (i: number, patch: Partial<TierDraft>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleSave = () => {
    setSaveError(null);
    save.mutate(sorted, {
      onSuccess: () => toastSuccess("Cancellation policy saved"),
      onError: (err) => { setSaveError(err instanceof Error ? err.message : "Could not save."); toastError(err, "Could not save cancellation policy"); },
    });
  };

  // A worked example off the current draft, sorted.
  const exampleRows = [
    ...sorted.map((t, i) => ({
      label: `${i === 0 ? "0" : sorted[i - 1].upto_minutes}–${t.upto_minutes} min after booking`,
      value: `keep ${t.penalty_percent}%`,
    })),
    { label: sorted.length ? `after ${sorted[sorted.length - 1].upto_minutes} min` : "any time", value: "keep 100% (no plan refund)" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cancellation Policy</CardTitle>
          <CardDescription>
            When a rider cancels a paid booking before pickup. Each tier: cancel within this many minutes of booking and
            the business keeps that percent of the plan amount the rider paid. The security deposit is always refunded in
            full. Past the last tier, nothing of the plan is refunded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Within (minutes of booking)</th>
                  <th className="px-2 py-2 font-medium">Keep back (% of plan paid)</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-2">
                      <Input type="number" min={1} value={r.upto_minutes} className="w-32"
                        onChange={(e) => { setSaveError(null); patchRow(i, { upto_minutes: e.target.value }); }} />
                    </td>
                    <td className="px-2 py-2">
                      <Input type="number" min={0} max={100} value={r.penalty_percent} className="w-28"
                        onChange={(e) => { setSaveError(null); patchRow(i, { penalty_percent: e.target.value }); }} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Remove tier" onClick={() => removeRow(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={3} className="px-2 py-3 text-xs text-muted-foreground">No tiers — cancellations are free (deposit and plan both refunded).</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={addRow}><PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add tier</Button>
            <Button size="sm" disabled={invalid || save.isPending || rows.length === 0 && (data?.length ?? 0) === 0} onClick={handleSave}>
              {save.isPending ? "Saving…" : "Save Policy"}
            </Button>
            {invalid && <span className="text-xs text-destructive">Minutes must be unique whole numbers ≥ 1; percent 0–100.</span>}
            {saveError && <span className="text-xs text-destructive">{saveError}</span>}
          </div>

          <div className="rounded-lg bg-secondary/40 p-3 text-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How this reads</p>
            {exampleRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
            ))}
            <p className="mt-2 text-[0.6875rem] text-muted-foreground">
              Set the first tier&apos;s percent to <span className="font-medium text-foreground">0</span> for a free-cancellation window.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charge Rules
// ---------------------------------------------------------------------------

function ChargeRulesTab() {
  const [scope, setScope] = useState<ChargeRuleScope | "all">("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<ChargeRule | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ChargeRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChargeRule | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError, refetch } = useChargeRules({
    scope: scope === "all" ? undefined : scope,
    active: status === "all" ? undefined : status === "active",
    page,
    pageSize: 8,
  });
  const toggleActive = useUpdateChargeRule();
  const deleteRule = useDeleteChargeRule();

  const chargeRuleColumns: DataTableColumn<ChargeRule>[] = [
    { header: "Charge", key: "charge_name", render: (r) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{r.charge_name}</p>
        <p className="text-xs text-muted-foreground">{chargeCodeLabel(r.charge_code)}</p>
      </div>
    ) },
    {
      header: "Scope",
      key: "scope",
      render: (r) => (
        <div className="min-w-0">
          <Badge variant={r.scope === "global" ? "info" : "secondary"}>
            {r.scope === "global" ? "Global" : "Vehicle Specific"}
          </Badge>
          {r.scope === "vehicle" && r.vehicle && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{r.vehicle.registration_number}</p>
          )}
        </div>
      ),
    },
    {
      header: "Amount",
      key: "amount",
      render: (r) => (r.amount_type === "percentage" ? `${r.amount}%` : formatCurrency(r.amount)),
    },
    {
      header: "Frequency",
      key: "frequency_type",
      render: (r) => (
        <span className="text-sm">
          {CHARGE_FREQUENCY_LABELS[r.frequency_type]}
          {r.frequency_type === "every_n_cycles" && r.frequency_n ? ` (${r.frequency_n})` : ""}
        </span>
      ),
    },
    { header: "Status", key: "active", render: (r) => <StatusBadge status={r.active ? "active" : "inactive"} /> },
    { header: "Effective from", key: "effective_from", render: (r) => formatDate(r.effective_from), hideOnMobile: true },
    { header: "Effective to", key: "effective_to", render: (r) => (r.effective_to ? formatDate(r.effective_to) : "—"), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (r) => (
        <div className="inline-flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Edit"
            aria-label="Edit"
            onClick={(e) => { e.stopPropagation(); setEditTarget(r); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title={r.active ? "Deactivate" : "Activate"}
            aria-label={r.active ? "Deactivate" : "Activate"}
            onClick={(e) => { e.stopPropagation(); setToggleTarget(r); }}
          >
            {r.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Delete"
            aria-label="Delete"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <VehicleRecoveryNote />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={scope} onValueChange={(v) => { setScope(v as ChargeRuleScope | "all"); setPage(1); }}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                {CHARGE_RULE_SCOPE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s === "all" ? "All scopes" : s === "global" ? "Global" : "Vehicle Specific"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v as "all" | "active" | "inactive"); setPage(1); }}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {CHARGE_RULE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> New Rule
          </Button>
        </div>

        <DataTable
          columns={chargeRuleColumns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No charge rules yet — create one to get started"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <ChargeRuleDialog
        rule={editTarget}
        mode="edit"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      />
      <ChargeRuleDialog rule={null} mode="create" open={creating} onOpenChange={setCreating} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={toggleTarget?.active ? "Deactivate this charge rule?" : "Activate this charge rule?"}
        description={
          toggleTarget
            ? toggleTarget.active
              ? `"${toggleTarget.charge_name}" will stop applying to new charges. Rider charges already generated from it are unaffected. You can reactivate it later.`
              : `"${toggleTarget.charge_name}" will start applying to new charges again.`
            : undefined
        }
        confirmLabel={toggleTarget?.active ? "Deactivate" : "Activate"}
        destructive={!!toggleTarget?.active}
        loading={toggleActive.isPending}
        onConfirm={() => {
          if (!toggleTarget) return;
          const nextActive = !toggleTarget.active;
          toggleActive.mutate(
            { id: toggleTarget.id, patch: { active: nextActive } },
            {
              onSuccess: () => {
                toastSuccess(nextActive ? "Charge rule activated" : "Charge rule deactivated");
                setToggleTarget(null);
              },
              onError: (err) => toastError(err, "Could not update charge rule"),
            },
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Permanently delete this charge rule?"
        description={
          deleteTarget
            ? `"${deleteTarget.charge_name}" will be permanently removed from the database. This cannot be undone. Rider charges already generated from it are unaffected.`
            : undefined
        }
        confirmLabel="Delete permanently"
        destructive
        loading={deleteRule.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteRule.mutate(deleteTarget.id, {
            onSuccess: () => {
              toastSuccess("Charge rule deleted");
              setDeleteTarget(null);
            },
            onError: (err) => toastError(err, "Could not delete charge rule"),
          });
        }}
      />
    </div>
  );
}

function VehiclePicker({ value, onChange }: { value: { id: string; name: string; registration_number: string } | null; onChange: (v: { id: string; name: string; registration_number: string } | null) => void }) {
  const [search, setSearch] = useState("");
  const { data } = useVehicles({ search, page: 1, pageSize: 8 });
  const results = search.trim().length >= 2 ? (data?.data ?? []) : [];

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span className="font-medium">{value.name} · {value.registration_number}</span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Change</Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search vehicle by name or registration number…"
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-soft">
          {results.map((v) => (
            <button
              key={v.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-card-hover"
              onClick={() => { onChange({ id: v.id, name: v.name, registration_number: v.registration_number }); setSearch(""); }}
            >
              <span className="font-medium">{v.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{v.registration_number}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChargeRuleDialog({
  rule,
  mode,
  open,
  onOpenChange,
}: {
  rule: ChargeRule | null;
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateChargeRule();
  const update = useUpdateChargeRule();

  const [chargeCode, setChargeCode] = useState<ChargeCode>(rule?.charge_code ?? "transaction_fee");
  const [chargeName, setChargeName] = useState(rule?.charge_name ?? CHARGE_CODE_LABELS.transaction_fee);
  const [description, setDescription] = useState(rule?.description ?? "");
  const [amountType, setAmountType] = useState<ChargeAmountType>(rule?.amount_type ?? "fixed");
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "");
  const [frequencyType, setFrequencyType] = useState<ChargeFrequencyType>(rule?.frequency_type ?? "every_n_cycles");
  const [frequencyN, setFrequencyN] = useState(rule?.frequency_n ? String(rule.frequency_n) : "4");
  const [scope, setScope] = useState<ChargeRuleScope>(rule?.scope ?? "global");
  const [vehicle, setVehicle] = useState<{ id: string; name: string; registration_number: string } | null>(
    rule?.scope === "vehicle" && rule.vehicle
      ? { id: rule.vehicle.id, name: rule.vehicle.name, registration_number: rule.vehicle.registration_number }
      : null,
  );
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effective_from ?? "");
  const [effectiveTo, setEffectiveTo] = useState(rule?.effective_to ?? "");
  const [active, setActive] = useState(rule?.active ?? true);

  // The dialog stays mounted across opens (BillingPage renders it
  // unconditionally so it can animate open/closed) — without this, the
  // useState initializers above only ever run once, so a second "New Rule"
  // click reopens with whatever was typed last time still in the fields,
  // and "Edit" on a different rule shows stale values from whichever rule
  // was open before. Re-sync on every open, mirroring PlansPage's
  // PlanFormDialog (`useEffect(() => { if (open) setForm(...) }, [open, plan])`).
  useEffect(() => {
    if (!open) return;
    setChargeCode(rule?.charge_code ?? "transaction_fee");
    setChargeName(rule?.charge_name ?? CHARGE_CODE_LABELS.transaction_fee);
    setDescription(rule?.description ?? "");
    setAmountType(rule?.amount_type ?? "fixed");
    setAmount(rule ? String(rule.amount) : "");
    setFrequencyType(rule?.frequency_type ?? "every_n_cycles");
    setFrequencyN(rule?.frequency_n ? String(rule.frequency_n) : "4");
    setScope(rule?.scope ?? "global");
    setVehicle(
      rule?.scope === "vehicle" && rule.vehicle
        ? { id: rule.vehicle.id, name: rule.vehicle.name, registration_number: rule.vehicle.registration_number }
        : null,
    );
    setEffectiveFrom(rule?.effective_from ?? "");
    setEffectiveTo(rule?.effective_to ?? "");
    setActive(rule?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule]);

  const isPending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const amountValid = amount.trim().length > 0 && Number(amount) >= 0;
  const frequencyNValid = frequencyType !== "every_n_cycles" || (frequencyN.trim().length > 0 && Number(frequencyN) > 0);
  const scopeValid = scope === "global" || !!vehicle;
  const formValid = chargeName.trim().length > 0 && amountValid && frequencyNValid && scopeValid;

  const close = () => onOpenChange(false);

  const handleSubmit = () => {
    if (mode === "create") {
      create.mutate(
        {
          charge_code: chargeCode,
          charge_name: chargeName.trim(),
          description: description.trim() || undefined,
          amount_type: amountType,
          amount: Number(amount),
          frequency_type: frequencyType,
          frequency_n: frequencyType === "every_n_cycles" ? Number(frequencyN) : undefined,
          scope,
          vehicle_id: scope === "vehicle" ? vehicle?.id : undefined,
          effective_from: effectiveFrom || undefined,
          effective_to: effectiveTo || undefined,
          active,
        },
        {
          onSuccess: () => { toastSuccess("Charge rule created"); close(); },
          onError: (err) => toastError(err, "Could not create charge rule"),
        },
      );
    } else if (rule) {
      update.mutate(
        {
          id: rule.id,
          patch: {
            charge_name: chargeName.trim(),
            description: description.trim() || undefined,
            amount_type: amountType,
            amount: Number(amount),
            frequency_type: frequencyType,
            frequency_n: frequencyType === "every_n_cycles" ? Number(frequencyN) : undefined,
            effective_from: effectiveFrom || undefined,
            effective_to: effectiveTo || undefined,
            active,
          },
        },
        {
          onSuccess: () => { toastSuccess("Charge rule updated"); close(); },
          onError: (err) => toastError(err, "Could not update charge rule"),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New charge rule" : "Edit charge rule"}</DialogTitle>
          <DialogDescription>
            {scope === "global"
              ? "This configuration will affect all eligible vehicles from the effective date."
              : "This configuration will override the global billing configuration for this vehicle."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {mode === "create" && (
            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("global")}
                  className={cn(
                    "rounded-lg border border-border p-3 text-sm transition-smooth",
                    scope === "global" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                  )}
                >
                  All Vehicles
                </button>
                <button
                  type="button"
                  onClick={() => setScope("vehicle")}
                  className={cn(
                    "rounded-lg border border-border p-3 text-sm transition-smooth",
                    scope === "vehicle" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                  )}
                >
                  Single Vehicle
                </button>
              </div>
              {scope === "vehicle" && <VehiclePicker value={vehicle} onChange={setVehicle} />}
            </div>
          )}
          {mode === "edit" && rule && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Scope (fixed at creation)</p>
              <p className="font-medium">
                {rule.scope === "global"
                  ? "All Vehicles"
                  : `Single Vehicle — ${rule.vehicle ? `${rule.vehicle.name} · ${rule.vehicle.registration_number}` : "—"}`}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Charge type</Label>
            <Select
              value={chargeCode}
              onValueChange={(v) => {
                setChargeCode(v);
                if (mode === "create") setChargeName(chargeCodeLabel(v));
              }}
              disabled={mode === "edit"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHARGE_CODES.map((c) => <SelectItem key={c} value={c}>{chargeCodeLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Display name</Label>
            <Input value={chargeName} onChange={(e) => setChargeName(e.target.value)} maxLength={120} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Amount type</Label>
              <Select value={amountType} onValueChange={(v) => setAmountType(v as ChargeAmountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Frequency</Label>
              <Select value={frequencyType} onValueChange={(v) => setFrequencyType(v as ChargeFrequencyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CHARGE_FREQUENCY_LABELS) as ChargeFrequencyType[]).map((f) => (
                    <SelectItem key={f} value={f}>{CHARGE_FREQUENCY_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {frequencyType === "every_n_cycles" && (
              <div className="space-y-1">
                <Label className="text-xs">Every N cycles</Label>
                <Input type="number" min={1} value={frequencyN} onChange={(e) => setFrequencyN(e.target.value)} placeholder="4" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Effective from</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Effective to (optional)</Label>
              <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label className="text-xs">Active</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        {!!error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button disabled={isPending || !formValid} onClick={handleSubmit}>
            {isPending ? "Saving..." : mode === "create" ? "Create Rule" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Rider Charges
// ---------------------------------------------------------------------------

function RiderChargesTab() {
  const [status, setStatus] = useState<RiderChargeStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [waiveTarget, setWaiveTarget] = useState<RiderCharge | null>(null);

  const { data, isLoading, isError, refetch } = useRiderCharges({ status, page, pageSize: 8 });

  const columns: DataTableColumn<RiderCharge>[] = [
    {
      header: "Rider",
      key: "rider",
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.booking?.rider_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{c.booking?.rider_phone ?? ""}</p>
        </div>
      ),
    },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (c) => <span className="text-sm">{c.booking?.vehicle_model_name ?? "—"}</span>,
      hideOnMobile: true,
    },
    { header: "Charge", key: "charge_name", render: (c) => c.charge_name },
    { header: "Cycle", key: "billing_cycle_number", render: (c) => c.billing_cycle_number ?? "—", hideOnMobile: true },
    { header: "Amount", key: "amount", render: (c) => formatCurrency(c.amount) },
    { header: "Status", key: "status", render: (c) => <StatusBadge status={c.status} /> },
    { header: "Created", key: "created_at", render: (c) => formatDate(c.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (c) => {
        if (c.status !== "pending" && c.status !== "invoiced") {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setWaiveTarget(c); }}>
            Waive
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select value={status} onValueChange={(v) => { setStatus(v as RiderChargeStatus | "all"); setPage(1); }}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {RIDER_CHARGE_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No rider charges yet"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <WaiveChargeDialog charge={waiveTarget} onOpenChange={(o) => !o && setWaiveTarget(null)} />
    </div>
  );
}

function WaiveChargeDialog({
  charge,
  onOpenChange,
}: {
  charge: RiderCharge | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [waivedAmount, setWaivedAmount] = useState("");
  const [reason, setReason] = useState("");
  const waive = useWaiveRiderCharge();

  const close = () => {
    onOpenChange(false);
    setWaivedAmount("");
    setReason("");
  };

  const amountValid = waivedAmount.trim().length > 0
    && Number(waivedAmount) >= 0
    && (!charge || Number(waivedAmount) <= charge.amount);
  const reasonValid = reason.trim().length >= 3;

  return (
    <Dialog
      open={!!charge}
      onOpenChange={(o) => {
        if (!o) close();
        else if (charge) setWaivedAmount(String(charge.amount));
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive {charge?.charge_name}?</DialogTitle>
          <DialogDescription>
            Original amount: {charge ? formatCurrency(charge.amount) : ""}. The charge stays on record — this only
            changes how much of it the rider owes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Waived amount (₹)</Label>
            <Input
              type="number"
              min={0}
              max={charge?.amount}
              value={waivedAmount}
              onChange={(e) => setWaivedAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (at least 3 characters)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. First-time late payment" />
          </div>
        </div>

        {waive.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {waive.error instanceof ApiError ? waive.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button
            disabled={waive.isPending || !amountValid || !reasonValid}
            onClick={() => {
              if (!charge) return;
              waive.mutate(
                { id: charge.id, input: { waived_amount: Number(waivedAmount), reason: reason.trim() } },
                {
                  onSuccess: () => { toastSuccess("Charge waived"); close(); },
                  onError: (err) => toastError(err, "Could not waive charge"),
                },
              );
            }}
          >
            {waive.isPending ? "Waiving..." : (
              <>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Confirm Waive
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Discount Rules
// ---------------------------------------------------------------------------

function DiscountRulesTab() {
  const [scope, setScope] = useState<ChargeRuleScope | "all">("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<DiscountRule | null>(null);
  const [toggleTarget, setToggleTarget] = useState<DiscountRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DiscountRule | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError, refetch } = useDiscountRules({
    scope: scope === "all" ? undefined : scope,
    active: status === "all" ? undefined : status === "active",
    page,
    pageSize: 8,
  });
  const toggleActive = useUpdateDiscountRule();
  const deleteRule = useDeleteDiscountRule();

  const columns: DataTableColumn<DiscountRule>[] = [
    { header: "Discount", key: "discount_name", render: (r) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{r.discount_name}</p>
        <p className="text-xs text-muted-foreground">{discountCodeLabel(r.discount_code)}</p>
      </div>
    ) },
    {
      header: "Scope",
      key: "scope",
      render: (r) => (
        <div className="min-w-0">
          <Badge variant={r.scope === "global" ? "info" : "secondary"}>
            {r.scope === "global" ? "Global" : "Vehicle Specific"}
          </Badge>
          {r.scope === "vehicle" && r.vehicle && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{r.vehicle.registration_number}</p>
          )}
        </div>
      ),
    },
    {
      header: "Value",
      key: "value",
      render: (r) => (r.discount_type === "percentage" ? `${r.value}%` : formatCurrency(r.value)),
    },
    {
      header: "Duration",
      key: "frequency_type",
      render: (r) => (
        <span className="text-sm">
          {DISCOUNT_FREQUENCY_LABELS[r.frequency_type]}
          {r.frequency_type === "first_n_cycles" && r.frequency_n ? ` (${r.frequency_n})` : ""}
        </span>
      ),
    },
    { header: "Status", key: "active", render: (r) => <StatusBadge status={r.active ? "active" : "inactive"} /> },
    { header: "Effective from", key: "effective_from", render: (r) => formatDate(r.effective_from), hideOnMobile: true },
    { header: "Effective to", key: "effective_to", render: (r) => (r.effective_to ? formatDate(r.effective_to) : "—"), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (r) => (
        <div className="inline-flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Edit"
            aria-label="Edit"
            onClick={(e) => { e.stopPropagation(); setEditTarget(r); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title={r.active ? "Deactivate" : "Activate"}
            aria-label={r.active ? "Deactivate" : "Activate"}
            onClick={(e) => { e.stopPropagation(); setToggleTarget(r); }}
          >
            {r.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Delete"
            aria-label="Delete"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={scope} onValueChange={(v) => { setScope(v as ChargeRuleScope | "all"); setPage(1); }}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                {CHARGE_RULE_SCOPE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s === "all" ? "All scopes" : s === "global" ? "Global" : "Vehicle Specific"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v as "all" | "active" | "inactive"); setPage(1); }}>
              <SelectTrigger className="sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {CHARGE_RULE_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> New Discount
          </Button>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No discount rules yet — create one to get started"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <DiscountRuleDialog
        rule={editTarget}
        mode="edit"
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      />
      <DiscountRuleDialog rule={null} mode="create" open={creating} onOpenChange={setCreating} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={toggleTarget?.active ? "Deactivate this discount rule?" : "Activate this discount rule?"}
        description={
          toggleTarget
            ? toggleTarget.active
              ? `"${toggleTarget.discount_name}" will stop applying to new discounts. Discounts already applied from it are unaffected. You can reactivate it later.`
              : `"${toggleTarget.discount_name}" will start applying to new discounts again.`
            : undefined
        }
        confirmLabel={toggleTarget?.active ? "Deactivate" : "Activate"}
        destructive={!!toggleTarget?.active}
        loading={toggleActive.isPending}
        onConfirm={() => {
          if (!toggleTarget) return;
          const nextActive = !toggleTarget.active;
          toggleActive.mutate(
            { id: toggleTarget.id, patch: { active: nextActive } },
            {
              onSuccess: () => {
                toastSuccess(nextActive ? "Discount rule activated" : "Discount rule deactivated");
                setToggleTarget(null);
              },
              onError: (err) => toastError(err, "Could not update discount rule"),
            },
          );
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Permanently delete this discount rule?"
        description={
          deleteTarget
            ? `"${deleteTarget.discount_name}" will be permanently removed from the database. This cannot be undone. Discounts already applied from it are unaffected.`
            : undefined
        }
        confirmLabel="Delete permanently"
        destructive
        loading={deleteRule.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteRule.mutate(deleteTarget.id, {
            onSuccess: () => {
              toastSuccess("Discount rule deleted");
              setDeleteTarget(null);
            },
            onError: (err) => toastError(err, "Could not delete discount rule"),
          });
        }}
      />
    </div>
  );
}

function DiscountRuleDialog({
  rule,
  mode,
  open,
  onOpenChange,
}: {
  rule: DiscountRule | null;
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateDiscountRule();
  const update = useUpdateDiscountRule();

  const [discountCode, setDiscountCode] = useState<DiscountCode>(rule?.discount_code ?? "loyalty");
  const [discountName, setDiscountName] = useState(rule?.discount_name ?? DISCOUNT_CODE_LABELS.loyalty);
  const [description, setDescription] = useState(rule?.description ?? "");
  const [discountType, setDiscountType] = useState<ChargeAmountType>(rule?.discount_type ?? "fixed");
  const [value, setValue] = useState(rule ? String(rule.value) : "");
  const [frequencyType, setFrequencyType] = useState<DiscountFrequencyType>(rule?.frequency_type ?? "first_n_cycles");
  const [frequencyN, setFrequencyN] = useState(rule?.frequency_n ? String(rule.frequency_n) : "4");
  const [scope, setScope] = useState<ChargeRuleScope>(rule?.scope ?? "global");
  const [vehicle, setVehicle] = useState<{ id: string; name: string; registration_number: string } | null>(
    rule?.scope === "vehicle" && rule.vehicle
      ? { id: rule.vehicle.id, name: rule.vehicle.name, registration_number: rule.vehicle.registration_number }
      : null,
  );
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effective_from ?? "");
  const [effectiveTo, setEffectiveTo] = useState(rule?.effective_to ?? "");
  const [active, setActive] = useState(rule?.active ?? true);

  // See ChargeRuleDialog's identical effect for why this is needed — the
  // dialog stays mounted across opens, so state must be re-synced every time
  // it opens rather than only initialized once.
  useEffect(() => {
    if (!open) return;
    setDiscountCode(rule?.discount_code ?? "loyalty");
    setDiscountName(rule?.discount_name ?? DISCOUNT_CODE_LABELS.loyalty);
    setDescription(rule?.description ?? "");
    setDiscountType(rule?.discount_type ?? "fixed");
    setValue(rule ? String(rule.value) : "");
    setFrequencyType(rule?.frequency_type ?? "first_n_cycles");
    setFrequencyN(rule?.frequency_n ? String(rule.frequency_n) : "4");
    setScope(rule?.scope ?? "global");
    setVehicle(
      rule?.scope === "vehicle" && rule.vehicle
        ? { id: rule.vehicle.id, name: rule.vehicle.name, registration_number: rule.vehicle.registration_number }
        : null,
    );
    setEffectiveFrom(rule?.effective_from ?? "");
    setEffectiveTo(rule?.effective_to ?? "");
    setActive(rule?.active ?? true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule]);

  const isPending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const valueValid = value.trim().length > 0 && Number(value) >= 0
    && (discountType !== "percentage" || Number(value) <= 100);
  const frequencyNValid = frequencyType !== "first_n_cycles" || (frequencyN.trim().length > 0 && Number(frequencyN) > 0);
  const scopeValid = scope === "global" || !!vehicle;
  const formValid = discountName.trim().length > 0 && valueValid && frequencyNValid && scopeValid;

  const close = () => onOpenChange(false);

  const handleSubmit = () => {
    if (mode === "create") {
      create.mutate(
        {
          discount_code: discountCode,
          discount_name: discountName.trim(),
          description: description.trim() || undefined,
          discount_type: discountType,
          value: Number(value),
          frequency_type: frequencyType,
          frequency_n: frequencyType === "first_n_cycles" ? Number(frequencyN) : undefined,
          scope,
          vehicle_id: scope === "vehicle" ? vehicle?.id : undefined,
          effective_from: effectiveFrom || undefined,
          effective_to: effectiveTo || undefined,
          active,
        },
        {
          onSuccess: () => { toastSuccess("Discount rule created"); close(); },
          onError: (err) => toastError(err, "Could not create discount rule"),
        },
      );
    } else if (rule) {
      update.mutate(
        {
          id: rule.id,
          patch: {
            discount_name: discountName.trim(),
            description: description.trim() || undefined,
            discount_type: discountType,
            value: Number(value),
            frequency_type: frequencyType,
            frequency_n: frequencyType === "first_n_cycles" ? Number(frequencyN) : undefined,
            effective_from: effectiveFrom || undefined,
            effective_to: effectiveTo || undefined,
            active,
          },
        },
        {
          onSuccess: () => { toastSuccess("Discount rule updated"); close(); },
          onError: (err) => toastError(err, "Could not update discount rule"),
        },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New discount rule" : "Edit discount rule"}</DialogTitle>
          <DialogDescription>
            {scope === "global"
              ? "This configuration will affect all eligible vehicles from the effective date."
              : "This configuration will override the global billing configuration for this vehicle."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {mode === "create" && (
            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("global")}
                  className={cn(
                    "rounded-lg border border-border p-3 text-sm transition-smooth",
                    scope === "global" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                  )}
                >
                  All Vehicles
                </button>
                <button
                  type="button"
                  onClick={() => setScope("vehicle")}
                  className={cn(
                    "rounded-lg border border-border p-3 text-sm transition-smooth",
                    scope === "vehicle" ? "border-primary bg-primary/10 text-primary" : "hover:bg-card-hover",
                  )}
                >
                  Single Vehicle
                </button>
              </div>
              {scope === "vehicle" && <VehiclePicker value={vehicle} onChange={setVehicle} />}
            </div>
          )}
          {mode === "edit" && rule && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Scope (fixed at creation)</p>
              <p className="font-medium">
                {rule.scope === "global"
                  ? "All Vehicles"
                  : `Single Vehicle — ${rule.vehicle ? `${rule.vehicle.name} · ${rule.vehicle.registration_number}` : "—"}`}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Discount type</Label>
            <Select
              value={discountCode}
              onValueChange={(v) => {
                const code = v as DiscountCode;
                setDiscountCode(code);
                if (mode === "create") setDiscountName(discountCodeLabel(code));
              }}
              disabled={mode === "edit"}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISCOUNT_CODES.map((c) => <SelectItem key={c} value={c}>{discountCodeLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Display name</Label>
            <Input value={discountName} onChange={(e) => setDiscountName(e.target.value)} maxLength={120} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Value type</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as ChargeAmountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <Input
                type="number"
                min={0}
                max={discountType === "percentage" ? 100 : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Duration</Label>
              <Select value={frequencyType} onValueChange={(v) => setFrequencyType(v as DiscountFrequencyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DISCOUNT_FREQUENCY_LABELS) as DiscountFrequencyType[]).map((f) => (
                    <SelectItem key={f} value={f}>{DISCOUNT_FREQUENCY_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {frequencyType === "first_n_cycles" && (
              <div className="space-y-1">
                <Label className="text-xs">Number of cycles</Label>
                <Input type="number" min={1} value={frequencyN} onChange={(e) => setFrequencyN(e.target.value)} placeholder="4" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Effective from</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Effective to (optional)</Label>
              <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label className="text-xs">Active</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        {!!error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button disabled={isPending || !formValid} onClick={handleSubmit}>
            {isPending ? "Saving..." : mode === "create" ? "Create Discount" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Rider Discounts
// ---------------------------------------------------------------------------

function DiscountsTab() {
  const [status, setStatus] = useState<RiderDiscountStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<RiderDiscount | null>(null);

  const { data, isLoading, isError, refetch } = useRiderDiscounts({ status, page, pageSize: 8 });

  const columns: DataTableColumn<RiderDiscount>[] = [
    {
      header: "Rider",
      key: "rider",
      render: (d) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{d.booking?.rider_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{d.booking?.rider_phone ?? ""}</p>
        </div>
      ),
    },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (d) => <span className="text-sm">{d.booking?.vehicle_model_name ?? "—"}</span>,
      hideOnMobile: true,
    },
    { header: "Discount", key: "discount_name", render: (d) => d.discount_name },
    { header: "Cycle", key: "billing_cycle_number", render: (d) => d.billing_cycle_number ?? "—", hideOnMobile: true },
    { header: "Amount", key: "amount", render: (d) => <span className="text-success">-{formatCurrency(d.amount)}</span> },
    { header: "Status", key: "status", render: (d) => <StatusBadge status={d.status} /> },
    { header: "Created", key: "created_at", render: (d) => formatDate(d.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (d) => {
        if (d.status !== "pending" && d.status !== "applied") {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setCancelTarget(d); }}>
            Cancel
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select value={status} onValueChange={(v) => { setStatus(v as RiderDiscountStatus | "all"); setPage(1); }}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {RIDER_DISCOUNT_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No discounts applied yet"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <CancelDiscountDialog discount={cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)} />
    </div>
  );
}

function CancelDiscountDialog({
  discount,
  onOpenChange,
}: {
  discount: RiderDiscount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const cancel = useCancelRiderDiscount();

  const close = () => {
    onOpenChange(false);
    setReason("");
  };

  const reasonValid = reason.trim().length >= 3;

  return (
    <Dialog open={!!discount} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {discount?.discount_name}?</DialogTitle>
          <DialogDescription>
            Amount: {discount ? formatCurrency(discount.amount) : ""}. The discount stays on record as cancelled — if
            it&apos;s already on an unpaid invoice, the rider will owe the full amount instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="text-xs">Reason (at least 3 characters)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Applied in error" />
        </div>

        {cancel.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {cancel.error instanceof ApiError ? cancel.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>Keep Discount</Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending || !reasonValid}
            onClick={() => {
              if (!discount) return;
              cancel.mutate(
                { id: discount.id, input: { reason: reason.trim() } },
                {
                  onSuccess: () => { toastSuccess("Discount cancelled"); close(); },
                  onError: (err) => toastError(err, "Could not cancel discount"),
                },
              );
            }}
          >
            {cancel.isPending ? "Cancelling..." : "Confirm Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
