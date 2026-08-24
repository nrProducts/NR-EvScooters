import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, FileText, Recycle } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
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
import { useVehicle, useUpdateVehicle, useScrapVehicle } from "@/hooks/useVehicles";
import { ApiError } from "@/services/api/httpClient";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { formatDate, formatCurrency } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(id);
  const updateVehicle = useUpdateVehicle();
  const scrapVehicle = useScrapVehicle();
  const [editOpen, setEditOpen] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);

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
            {vehicle.model} · {vehicle.registration_number}
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
            {/*
              Battery number and charge level are gone: a battery is swapped at
              a station, so it was never a property of a scooter. Service dates
              are the maintenance history below, and insurance is one of the
              documents beside it — both were separately-stored copies of
              something already recorded elsewhere.
            */}
            <Detail label="VIN" value={vehicle.vin} />
            <Detail label="Current rider" value={vehicle.current_rider?.full_name ?? "Unassigned"} />
            <Detail label="Color" value={vehicle.color ?? "Not recorded"} />
            <Detail label="QR code" value={vehicle.qr_code ?? "Not assigned"} />
            <Detail label="IMEI / IoT device" value={vehicle.imei ?? "Not recorded"} />
            <Detail label="Batch number" value={vehicle.batch_number ?? "Not recorded"} />
            <Detail label="Purchase date" value={vehicle.purchase_date ? formatDate(vehicle.purchase_date) : "Not recorded"} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current plan</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              {vehicle.plan_name ? (
                <>
                  <div className="flex items-center justify-between">
                    <Detail label="Plan" value={vehicle.plan_name} />
                    {vehicle.plan_status && <StatusBadge status={vehicle.plan_status} />}
                  </div>
                  <Detail label="Start date" value={vehicle.plan_start_date ? formatDate(vehicle.plan_start_date) : "Not recorded"} />
                  <Detail label="End date" value={vehicle.plan_end_date ? formatDate(vehicle.plan_end_date) : "Not recorded"} />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No active plan — this vehicle is unassigned.</p>
              )}
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
                <p className="text-xs text-muted-foreground">
                  No registration, insurance, PUC, fitness or permit documents on file.
                </p>
              ) : (
                vehicle.documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium capitalize">{doc.doc_type}</p>
                      <p className="text-xs text-muted-foreground">expires {formatDate(doc.expires_on)}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
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

      {/*
        The Photos card is gone with the `vehicle_photos` table.

        Every scooter of a model carried the same six studio shots, re-uploaded
        per unit — those belong to the MODEL, and live on
        `vehicle_model_media` now. Condition photographs, the genuinely
        per-unit kind, are `incidents.photo_paths`, shown next to the damage
        they evidence rather than in a gallery detached from any claim.
      */}

      <VehicleHistorySplitView vehicle={vehicle} />

      <VehicleFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vehicle={vehicle}
        isPending={updateVehicle.isPending}
        error={updateVehicle.error}
        onSubmit={(input) =>
          updateVehicle.mutate({ id: vehicle.id, patch: input }, {
            onSuccess: () => {
              toastSuccess("Vehicle updated");
              setEditOpen(false);
            },
            onError: (err) => toastError(err, "Could not update vehicle"),
          })
        }
      />

      <ScrapDialog
        open={scrapOpen}
        onOpenChange={setScrapOpen}
        onSubmit={(input) =>
          scrapVehicle.mutate({ id: vehicle.id, input }, {
            onSuccess: () => {
              toastSuccess("Vehicle scrapped");
              setScrapOpen(false);
            },
            onError: (err) => toastError(err, "Could not scrap vehicle"),
          })
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
            {isPending && <Spinner className="h-4 w-4" />}
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
  icon?: typeof FileText;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
        {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
