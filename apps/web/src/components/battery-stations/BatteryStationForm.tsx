import { useEffect, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BatteryStationMapPicker } from "./BatteryStationMapPicker";
import {
  emptyStationForm, validateStationForm,
  type FormState, type StationFieldErrors,
} from "./stationFormValidation";
import { ApiError } from "@/services/api/httpClient";
import { formatCoordinate } from "@/lib/mapConfig";
import {
  BATTERY_STATION_STATUSES, STATION_STATUS_LABEL,
  type BatteryStation, type CreateStationPayload, type StationStatus,
} from "@/types/batteryStation";

function toForm(station: BatteryStation): FormState {
  return {
    // The raw stored name, underscores included — this field edits the real
    // value, so it must never show the display-formatted version.
    name: station.name,
    qisIds: [...station.qisIds],
    latitude: formatCoordinate(station.latitude),
    longitude: formatCoordinate(station.longitude),
    status: station.status,
    batteryCount: String(station.batteryCount),
    isVisibleOnMobile: station.isVisibleOnMobile,
  };
}

export function BatteryStationForm({
  open,
  onOpenChange,
  station,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to add a station; pass one to edit it. */
  station?: BatteryStation | null;
  onSubmit: (payload: CreateStationPayload) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [form, setForm] = useState<FormState>(emptyStationForm);
  const [qisDraft, setQisDraft] = useState("");
  const [errors, setErrors] = useState<StationFieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(station ? toForm(station) : emptyStationForm);
    setQisDraft("");
    setErrors({});
    setSubmitted(false);
  }, [open, station]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Errors only refresh after the first submit attempt, so the form
      // doesn't shout at the admin while they're still typing the first field.
      if (submitted) setErrors(validateStationForm(next));
      return next;
    });
  };

  const addQisId = () => {
    const value = qisDraft.trim();
    if (!value) return;
    if (form.qisIds.some((id) => id.toLowerCase() === value.toLowerCase())) {
      setErrors((e) => ({ ...e, qisIds: "That QIS ID is already in the list." }));
      return;
    }
    set("qisIds", [...form.qisIds, value]);
    setQisDraft("");
  };

  const removeQisId = (target: string) => set("qisIds", form.qisIds.filter((id) => id !== target));

  const pickedLocation =
    Number.isFinite(Number(form.latitude)) &&
    Number.isFinite(Number(form.longitude)) &&
    form.latitude.trim() !== "" &&
    form.longitude.trim() !== ""
      ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
      : null;

  const handleSubmit = () => {
    // A QIS ID typed but not yet added is what the admin meant to include —
    // losing it silently on save is the most annoying bug this form could have.
    const draft = qisDraft.trim();
    const qisIds = draft && !form.qisIds.some((id) => id.toLowerCase() === draft.toLowerCase())
      ? [...form.qisIds, draft]
      : form.qisIds;

    const candidate = { ...form, qisIds };
    const nextErrors = validateStationForm(candidate);
    setSubmitted(true);
    setErrors(nextErrors);
    setForm(candidate);
    setQisDraft("");
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: candidate.name.trim(),
      qisIds: candidate.qisIds,
      latitude: Number(candidate.latitude),
      longitude: Number(candidate.longitude),
      status: candidate.status,
      batteryCount: Number(candidate.batteryCount),
      isVisibleOnMobile: candidate.isVisibleOnMobile,
    });
  };

  // Field-level messages from the backend (409 duplicate QIS ID, etc.) win
  // over the local ones — they know things the client can't.
  const serverFields = error instanceof ApiError ? error.fields : undefined;
  const fieldError = (key: keyof StationFieldErrors) => serverFields?.[key] ?? errors[key];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{station ? `Edit ${station.name}` : "Add battery station"}</DialogTitle>
          <DialogDescription>
            Coordinates are stored exactly as entered and are what riders navigate to.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Station name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Station name"
              aria-invalid={!!fieldError("name")}
            />
            <FieldMessage message={fieldError("name")} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>QIS IDs</Label>
            <div className="flex gap-2">
              <Input
                value={qisDraft}
                onChange={(e) => setQisDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQisId();
                  }
                }}
                placeholder="QIS ID"
                aria-invalid={!!fieldError("qisIds")}
              />
              <Button type="button" variant="outline" onClick={addQisId}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {form.qisIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {form.qisIds.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-mono text-xs"
                  >
                    {id}
                    <button
                      type="button"
                      onClick={() => removeQisId(id)}
                      aria-label={`Remove ${id}`}
                      className="text-muted-foreground transition-smooth hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <FieldMessage message={fieldError("qisIds")} />
          </div>

          <div className="space-y-1.5">
            <Label>Latitude</Label>
            <Input
              value={form.latitude}
              onChange={(e) => set("latitude", e.target.value)}
              inputMode="decimal"
              placeholder="Latitude"
              aria-invalid={!!fieldError("latitude")}
            />
            <FieldMessage message={fieldError("latitude")} />
          </div>

          <div className="space-y-1.5">
            <Label>Longitude</Label>
            <Input
              value={form.longitude}
              onChange={(e) => set("longitude", e.target.value)}
              inputMode="decimal"
              placeholder="Longitude"
              aria-invalid={!!fieldError("longitude")}
            />
            <FieldMessage message={fieldError("longitude")} />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as StationStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BATTERY_STATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATION_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Number of batteries</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={form.batteryCount}
              onChange={(e) => set("batteryCount", e.target.value)}
              aria-invalid={!!fieldError("batteryCount")}
            />
            <FieldMessage message={fieldError("batteryCount")} />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Show on mobile</p>
              <p className="text-xs text-muted-foreground">Hidden stations stay here but disappear from the rider map.</p>
            </div>
            <Switch
              checked={form.isVisibleOnMobile}
              onCheckedChange={(checked) => set("isVisibleOnMobile", checked)}
              aria-label="Show on mobile"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Label>Pick location on map</Label>
            </div>
            <BatteryStationMapPicker
              value={pickedLocation}
              onChange={(location) => {
                setForm((f) => {
                  const next = {
                    ...f,
                    latitude: formatCoordinate(location.latitude),
                    longitude: formatCoordinate(location.longitude),
                  };
                  if (submitted) setErrors(validateStationForm(next));
                  return next;
                });
              }}
            />
            {pickedLocation && (
              <p className="font-mono text-xs text-muted-foreground">
                {formatCoordinate(pickedLocation.latitude)}, {formatCoordinate(pickedLocation.longitude)}
              </p>
            )}
          </div>
        </div>

        {!!error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error instanceof ApiError ? error.message : "Something went wrong. Please try again."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Spinner className="h-4 w-4" />}
            {station ? "Save changes" : "Add station"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
