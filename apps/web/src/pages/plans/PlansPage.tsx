import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { usePlans, useCreatePlan, useUpdatePlan } from "@/hooks/usePlans";
import { useVehicleModelOptions } from "@/hooks/useVehicleModelOptions";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import type { PlanInput } from "@/services/api/plans";
import { formatCurrency, formatDate } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { useAuthStore } from "@/store/authStore";
import type { BillingCycle, Plan } from "@/types";

const BILLING_CYCLES: BillingCycle[] = ["daily", "weekly", "monthly", "yearly"];

const emptyForm: PlanInput = {
  name: "",
  billing_cycle: "weekly",
  price: 0,
  duration_days: 7,
  deposit_amount: 2000,
  vehicle_model_id: "",
  active: true,
};

function toForm(plan: Plan): PlanInput {
  return {
    name: plan.name,
    billing_cycle: plan.billing_cycle,
    price: plan.price,
    duration_days: plan.duration_days,
    deposit_amount: plan.deposit_amount,
    vehicle_model_id: plan.vehicle_model_id ?? "",
    included_minutes: plan.included_minutes ?? undefined,
    active: plan.active,
  };
}

export default function PlansPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = hasAction(user, "plans", "create");
  const canEdit = hasAction(user, "plans", "edit");
  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = usePlans({
    page: 1, pageSize: 100, sortBy: sort.by as "created_at" | "name" | "price", sortDir: sort.dir,
  });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);

  const columns: DataTableColumn<Plan>[] = [
    { header: "Name", key: "name", sortKey: "name", render: (p) => p.name },
    { header: "Billing cycle", key: "billing_cycle", render: (p) => <span className="capitalize">{p.billing_cycle}</span> },
    { header: "Duration", key: "duration_days", render: (p) => `${p.duration_days} day${p.duration_days === 1 ? "" : "s"}` },
    { header: "Price", key: "price", sortKey: "price", render: (p) => formatCurrency(p.price) },
    { header: "Deposit", key: "deposit_amount", render: (p) => formatCurrency(p.deposit_amount) },
    { header: "Status", key: "active", render: (p) => <StatusBadge status={p.active ? "active" : "inactive"} /> },
    { header: "Created", key: "created_at", sortKey: "created_at", render: (p) => formatDate(p.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (p) =>
        canEdit ? (
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditing(p); }}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  usePageSubtitle(`${data?.total ?? 0} plans · price, duration and deposit are configured here, never hardcoded`);

  return (
    <div className="space-y-4 animate-fade-in">
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New plan
          </Button>
        </div>
      )}

      <Card>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onRowClick={canEdit ? (p) => setEditing(p) : undefined}
          emptyTitle="No plans yet"
          sort={sort}
          onSortChange={onSortChange}
        />
      </Card>

      <PlanFormDialog open={creating} onOpenChange={setCreating} mode="create" />
      <PlanFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} mode="edit" plan={editing ?? undefined} />
    </div>
  );
}

function PlanFormDialog({
  open, onOpenChange, mode, plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  plan?: Plan;
}) {
  const [form, setForm] = useState<PlanInput>(plan ? toForm(plan) : emptyForm);
  const { data: models } = useVehicleModelOptions();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const mutation = mode === "create" ? create : update;

  useEffect(() => {
    if (open) setForm(plan ? toForm(plan) : emptyForm);
  }, [open, plan]);

  const submit = () => {
    if (mode === "create") {
      create.mutate(form, {
        onSuccess: () => {
          toastSuccess("Plan created");
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Could not create plan"),
      });
    } else if (plan) {
      const { vehicle_model_id: _ignored, ...patch } = form;
      update.mutate({ id: plan.id, patch }, {
        onSuccess: () => {
          toastSuccess("Plan updated");
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Could not update plan"),
      });
    }
  };

  const valid = form.name.trim().length > 0 && form.price > 0 && form.duration_days > 0
    && form.deposit_amount >= 0 && (mode === "edit" || !!form.vehicle_model_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New rental plan" : "Edit plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>

          {mode === "create" && (
            <div className="space-y-1.5">
              <Label>Vehicle model</Label>
              <Select
                value={form.vehicle_model_id}
                onValueChange={(v) => setForm((f) => ({ ...f, vehicle_model_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {(models ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Billing cycle (display only)</Label>
              <Select
                value={form.billing_cycle}
                onValueChange={(v) => setForm((f) => ({ ...f, billing_cycle: v as BillingCycle }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (days)</Label>
              <Input
                type="number"
                min={1}
                value={form.duration_days}
                onChange={(e) => setForm((f) => ({ ...f, duration_days: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Price (₹ per period)</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Security deposit (₹)</Label>
              <Input
                type="number"
                min={0}
                value={form.deposit_amount}
                onChange={(e) => setForm((f) => ({ ...f, deposit_amount: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="plan-active">Active (bookable by riders)</Label>
            <Switch
              id="plan-active"
              checked={form.active ?? true}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
            />
          </div>

          {mutation.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {mutation.error instanceof ApiError ? mutation.error.message : "Something went wrong."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={submit}>
            {mutation.isPending ? "Please wait..." : mode === "create" ? "Create plan" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
