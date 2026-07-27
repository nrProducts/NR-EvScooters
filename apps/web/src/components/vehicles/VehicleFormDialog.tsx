import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Vehicle, VehicleStatus } from "@/types";
import type { VehicleFormInput } from "@/services/api/vehicles";
import { ApiError } from "@/services/api/httpClient";

const VEHICLE_STATUSES: VehicleStatus[] = ["available", "in_use", "maintenance", "retired"];

const emptyForm: VehicleFormInput = {
  name: "",
  registration_number: "",
  battery_number: "",
  manufacturer: "",
  model: "",
  vin: "",
  battery_percentage: 100,
  status: "available",
  last_service_date: "",
  next_service_due_date: "",
};

function toForm(vehicle: Vehicle): VehicleFormInput {
  return {
    name: vehicle.name,
    registration_number: vehicle.registration_number,
    battery_number: vehicle.battery_number,
    manufacturer: vehicle.manufacturer,
    model: vehicle.model,
    vin: vehicle.vin,
    battery_percentage: vehicle.battery_percentage,
    status: vehicle.status,
    last_service_date: vehicle.last_service_date ?? "",
    next_service_due_date: vehicle.next_service_due_date ?? "",
  };
}

export function VehicleFormDialog({
  open,
  onOpenChange,
  vehicle,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new vehicle; pass one to edit it. */
  vehicle?: Vehicle;
  onSubmit: (input: VehicleFormInput) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [form, setForm] = useState<VehicleFormInput>(vehicle ? toForm(vehicle) : emptyForm);

  useEffect(() => {
    if (open) setForm(vehicle ? toForm(vehicle) : emptyForm);
  }, [open, vehicle]);

  const set = <K extends keyof VehicleFormInput>(key: K, value: VehicleFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSubmit =
    form.name.trim() &&
    form.registration_number.trim() &&
    form.battery_number.trim() &&
    form.manufacturer.trim() &&
    form.model.trim() &&
    form.vin.trim();

  const handleSubmit = () => {
    onSubmit({
      ...form,
      last_service_date: form.last_service_date || undefined,
      next_service_due_date: form.next_service_due_date || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vehicle ? `Edit ${vehicle.name}` : "Add vehicle"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Display name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Scooter #14" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v as VehicleStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Manufacturer">
            <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} placeholder="Motovolt" />
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="MVS7" />
          </Field>
          <Field label="Registration number">
            <Input
              value={form.registration_number}
              onChange={(e) => set("registration_number", e.target.value)}
              placeholder="TN00ZZ0000"
            />
          </Field>
          <Field label="VIN">
            <Input value={form.vin} onChange={(e) => set("vin", e.target.value)} placeholder="VIN12345" />
          </Field>
          <Field label="Battery number">
            <Input value={form.battery_number} onChange={(e) => set("battery_number", e.target.value)} placeholder="BAT-0042" />
          </Field>
          <Field label="Battery % (manual, for now)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.battery_percentage ?? ""}
              onChange={(e) => set("battery_percentage", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="Last service date">
            <Input
              type="date"
              value={form.last_service_date ?? ""}
              onChange={(e) => set("last_service_date", e.target.value)}
            />
          </Field>
          <Field label="Next service due">
            <Input
              type="date"
              value={form.next_service_due_date ?? ""}
              onChange={(e) => set("next_service_due_date", e.target.value)}
            />
          </Field>
        </div>

        {!!error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || isPending} onClick={handleSubmit}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {vehicle ? "Save changes" : "Add vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
