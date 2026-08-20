import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useVehicleModelOptions } from "@/hooks/useVehicleModelOptions";
import type { Vehicle } from "@/types";
import type { VehicleFormInput } from "@/services/api/vehicles";
import { ApiError } from "@/services/api/httpClient";

/*
 * What this form no longer asks for, and why.
 *
 * STATUS. `recompute_vehicle_status()` derives it from the vehicle's open
 * maintenance ticket, its rental assignment and its booking hold, and a
 * trigger keeps it current. A value typed here would be overwritten, so
 * offering the field would be offering a control that does nothing. Putting a
 * scooter into maintenance is opening a maintenance ticket; retiring one is
 * the Scrap action on the detail page.
 *
 * MANUFACTURER and MODEL. Properties of the MODEL, which is a row now — so
 * the form picks one rather than re-typing its name onto every unit.
 *
 * BATTERY NUMBER and CHARGE. A battery is swapped at a station; modelling it
 * as a permanent property of one scooter, enforced by a UNIQUE column, said
 * otherwise.
 *
 * SERVICE DATES. The maintenance history is the record of what was serviced
 * and when.
 *
 * INSURANCE. A `vehicle_documents` row, alongside registration, PUC, fitness
 * and permit — managed where the other documents are.
 */

const emptyForm: VehicleFormInput = {
  name: "",
  registration_number: "",
  vin: "",
  vehicle_model_id: "",
  color: "",
  qr_code: "",
  imei: "",
  purchase_date: "",
};

function toForm(vehicle: Vehicle): VehicleFormInput {
  return {
    name: vehicle.name,
    registration_number: vehicle.registration_number,
    vin: vehicle.vin,
    vehicle_model_id: vehicle.vehicle_model_id,
    color: vehicle.color ?? "",
    qr_code: vehicle.qr_code ?? "",
    imei: vehicle.imei ?? "",
    purchase_date: vehicle.purchase_date ?? "",
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
  error?: unknown;
}) {
  const [form, setForm] = useState<VehicleFormInput>(vehicle ? toForm(vehicle) : emptyForm);
  const { data: models = [] } = useVehicleModelOptions();

  useEffect(() => {
    if (open) setForm(vehicle ? toForm(vehicle) : emptyForm);
  }, [open, vehicle]);

  const set = <K extends keyof VehicleFormInput>(key: K, value: VehicleFormInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // The display name is optional — a vehicle can just be its plate.
  const canSubmit =
    form.registration_number.trim() &&
    form.vin.trim() &&
    form.vehicle_model_id;

  const handleSubmit = () => {
    onSubmit({
      ...form,
      name: form.name?.trim() || undefined,
      color: form.color || undefined,
      qr_code: form.qr_code || undefined,
      imei: form.imei || undefined,
      purchase_date: form.purchase_date || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vehicle ? `Edit ${vehicle.name}` : "Add vehicle"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Display name (optional)">
            <Input
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Scooter #14"
            />
          </Field>
          <Field label="Model">
            {/* Fixed at creation: a scooter does not become a different model. */}
            <Select
              value={form.vehicle_model_id}
              onValueChange={(v) => set("vehicle_model_id", v)}
              disabled={!!vehicle}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Field label="Color">
            <Input value={form.color ?? ""} onChange={(e) => set("color", e.target.value)} placeholder="Matte Black" />
          </Field>
          <Field label="QR code">
            <Input value={form.qr_code ?? ""} onChange={(e) => set("qr_code", e.target.value)} placeholder="QR-000042" />
          </Field>
          <Field label="IMEI / IoT device">
            <Input value={form.imei ?? ""} onChange={(e) => set("imei", e.target.value)} placeholder="356938035643809" />
          </Field>
          <Field label="Purchase date">
            <Input type="date" value={form.purchase_date ?? ""} onChange={(e) => set("purchase_date", e.target.value)} />
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
