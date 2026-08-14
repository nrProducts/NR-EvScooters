import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, BatteryMedium, Pencil, FileText, Images, Upload, Trash2, Loader2, Recycle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { VehicleFormDialog } from "@/components/vehicles/VehicleFormDialog";
import { VehicleHistorySplitView } from "@/components/vehicles/VehicleHistorySplitView";
import {
  useVehicle, useUpdateVehicle, useUploadVehiclePhoto, useDeleteVehiclePhoto, useScrapVehicle,
} from "@/hooks/useVehicles";
import { ApiError } from "@/services/api/httpClient";
import { formatDate, formatCurrency } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(id);
  const updateVehicle = useUpdateVehicle();
  const uploadPhoto = useUploadVehiclePhoto();
  const deletePhoto = useDeleteVehiclePhoto();
  const scrapVehicle = useScrapVehicle();
  const [editOpen, setEditOpen] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !vehicle) return <ErrorState message="Vehicle not found." onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/vehicles")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{vehicle.name}</h1>
          <p className="text-sm text-muted-foreground">
            {vehicle.manufacturer} {vehicle.model} · {vehicle.registration_number}
          </p>
        </div>
        <StatusBadge status={vehicle.status} />
        {vehicle.status === "maintenance" && hasAction(user, "vehicles", "delete") && (
          <Button variant="outline" size="sm" onClick={() => setScrapOpen(true)}>
            <Recycle className="h-4 w-4" /> Scrap
          </Button>
        )}
        {hasAction(user, "vehicles", "edit") && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vehicle details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="VIN" value={vehicle.vin} />
            <Detail label="Battery number" value={vehicle.battery_number} />
            <Detail
              label="Battery"
              value={`${vehicle.battery_percentage}%`}
              icon={BatteryMedium}
              hint="Manually recorded — live telemetry isn't wired up yet."
            />
            <Detail label="Current rider" value={vehicle.current_rider?.full_name ?? "None"} />
            <Detail label="Last service" value={vehicle.last_service_date ? formatDate(vehicle.last_service_date) : "Not recorded"} />
            <Detail label="Next service due" value={vehicle.next_service_due_date ? formatDate(vehicle.next_service_due_date) : "Not scheduled"} />
            <Detail label="Color" value={vehicle.color ?? "Not recorded"} />
            <Detail label="QR code" value={vehicle.qr_code ?? "Not assigned"} />
            <Detail label="IMEI / IoT device" value={vehicle.imei ?? "Not recorded"} />
            <Detail label="Purchase date" value={vehicle.purchase_date ? formatDate(vehicle.purchase_date) : "Not recorded"} />
            <Detail
              label="Insurance"
              value={
                vehicle.insurance_number
                  ? `${vehicle.insurance_number}${vehicle.insurance_expiry ? ` · expires ${formatDate(vehicle.insurance_expiry)}` : ""}`
                  : "Not recorded"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {vehicle.documents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No registration/insurance documents on file.</p>
            ) : (
              vehicle.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium capitalize">{doc.doc_type}</p>
                    <p className="text-xs text-muted-foreground">expires {formatDate(doc.expiry_date)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {vehicle.scrap_record && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Recycle className="h-4 w-4" /> Scrap record
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail label="Reason" value={vehicle.scrap_record.reason} />
            <Detail label="Scrapped on" value={formatDate(vehicle.scrap_record.scrapped_on)} />
            <Detail label="Approved by" value={vehicle.scrap_record.approved_by?.full_name ?? "—"} />
            <Detail
              label="Estimated value"
              value={vehicle.scrap_record.estimated_value != null ? formatCurrency(vehicle.scrap_record.estimated_value) : "Not recorded"}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Images className="h-4 w-4" /> Photos
          </CardTitle>
          {hasAction(user, "vehicles", "edit") && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto.mutate({ id: vehicle.id, file });
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" disabled={uploadPhoto.isPending} onClick={() => fileInputRef.current?.click()}>
                {uploadPhoto.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload photo
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {uploadPhoto.isError && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Could not upload that photo. Please try again.
            </p>
          )}
          {vehicle.photos.length === 0 ? (
            <EmptyState title="No photos yet" description="Upload condition or inspection photos for this vehicle." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {vehicle.photos.map((p) => (
                <div key={p.id} className="group relative overflow-hidden rounded-lg border border-border">
                  <img src={p.url} alt="Vehicle" className="aspect-square w-full object-cover" />
                  {p.is_primary && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Primary
                    </span>
                  )}
                  {hasAction(user, "vehicles", "edit") && (
                    <button
                      type="button"
                      onClick={() => deletePhoto.mutate({ id: vehicle.id, photoId: p.id })}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Delete photo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <VehicleHistorySplitView vehicle={vehicle} />

      <VehicleFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vehicle={vehicle}
        isPending={updateVehicle.isPending}
        error={updateVehicle.error}
        onSubmit={(input) =>
          updateVehicle.mutate({ id: vehicle.id, patch: input }, { onSuccess: () => setEditOpen(false) })
        }
      />

      <ScrapDialog
        open={scrapOpen}
        onOpenChange={setScrapOpen}
        onSubmit={(input) =>
          scrapVehicle.mutate({ id: vehicle.id, input }, { onSuccess: () => setScrapOpen(false) })
        }
        isPending={scrapVehicle.isPending}
        error={scrapVehicle.error}
      />
    </div>
  );
}

function ScrapDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { reason: string; estimated_value?: number }) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [reason, setReason] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setReason("");
          setEstimatedValue("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scrap this vehicle</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          This permanently retires the vehicle from the fleet and disables it from future bookings.
        </p>

        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>Estimated value (optional)</Label>
          <Input
            type="number"
            min={0}
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            placeholder="0"
          />
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
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3 || isPending}
            onClick={() =>
              onSubmit({
                reason: reason.trim(),
                estimated_value: estimatedValue ? Number(estimatedValue) : undefined,
              })
            }
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Scrap vehicle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: typeof BatteryMedium;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
