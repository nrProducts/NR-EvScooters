import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, FileText, Recycle, Plus, Trash2, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  useVehicle, useUpdateVehicle, useScrapVehicle, useCreateVehicleDocument, useDeleteVehicleDocument,
} from "@/hooks/useVehicles";
import { getVehicleDocumentUrl, type VehicleDocumentFormInput } from "@/services/api/vehicles";
import { ApiError } from "@/services/api/httpClient";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { formatDate, formatCurrency } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { VehicleDocument, VehicleDocumentType } from "@/types";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(id);
  const updateVehicle = useUpdateVehicle();
  const scrapVehicle = useScrapVehicle();
  const createDocument = useCreateVehicleDocument();
  const deleteDocument = useDeleteVehicleDocument();
  const [editOpen, setEditOpen] = useState(false);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<VehicleDocument | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const canEdit = hasAction(user, "vehicles", "edit");

  const openDocument = async (doc: VehicleDocument) => {
    setOpeningDocId(doc.id);
    try {
      const url = await getVehicleDocumentUrl(doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toastError(err, "Could not open document");
    } finally {
      setOpeningDocId(null);
    }
  };

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
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> Documents
              </CardTitle>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setAddDocOpen(true)}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              )}
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
                      <p className="text-xs text-muted-foreground">
                        #{doc.doc_number} · expires {formatDate(doc.expires_on)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {doc.has_file && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={openingDocId === doc.id}
                          onClick={() => void openDocument(doc)}
                          title="View file"
                        >
                          {openingDocId === doc.id ? <Spinner className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteDoc(doc)} title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
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

      <AddDocumentDialog
        open={addDocOpen}
        onOpenChange={setAddDocOpen}
        isPending={createDocument.isPending}
        error={createDocument.error}
        onSubmit={(input) =>
          createDocument.mutate({ vehicleId: vehicle.id, input }, {
            onSuccess: () => {
              toastSuccess("Document added");
              setAddDocOpen(false);
            },
            onError: (err) => toastError(err, "Could not add document"),
          })
        }
      />

      <ConfirmDialog
        open={!!deleteDoc}
        onOpenChange={(o) => !o && setDeleteDoc(null)}
        title="Delete this document?"
        description={deleteDoc ? `This removes the ${deleteDoc.doc_type} record and its file, if any. This can't be undone.` : undefined}
        confirmLabel="Delete"
        destructive
        loading={deleteDocument.isPending}
        onConfirm={() =>
          deleteDoc &&
          deleteDocument.mutate(deleteDoc.id, {
            onSuccess: () => {
              toastSuccess("Document deleted");
              setDeleteDoc(null);
            },
            onError: (err) => toastError(err, "Could not delete document"),
          })
        }
      />
    </div>
  );
}

const DOCUMENT_TYPES: { value: VehicleDocumentType; label: string }[] = [
  { value: "registration", label: "Registration (RC)" },
  { value: "insurance", label: "Insurance" },
  { value: "puc", label: "PUC" },
  { value: "fitness", label: "Fitness" },
  { value: "permit", label: "Permit" },
];

function AddDocumentDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: VehicleDocumentFormInput) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [docType, setDocType] = useState<VehicleDocumentType>("registration");
  const [docNumber, setDocNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setDocType("registration");
    setDocNumber("");
    setIssuedOn("");
    setExpiresOn("");
    setFile(null);
  };

  const canSubmit = docNumber.trim().length > 0 && expiresOn.length > 0 && !isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Document type</Label>
          <Select value={docType} onValueChange={(v) => setDocType(v as VehicleDocumentType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Document number</Label>
          <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="e.g. TN01AB1234" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Issued on (optional)</Label>
            <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expires on</Label>
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>File (optional — JPEG, PNG or PDF)</Label>
          <Input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                doc_type: docType,
                doc_number: docNumber.trim(),
                issued_on: issuedOn || undefined,
                expires_on: expiresOn,
                file: file ?? undefined,
              })
            }
          >
            {isPending && <Spinner className="h-4 w-4" />}
            Add document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
