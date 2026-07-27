import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, BatteryMedium, Pencil, FileText, History, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { VehicleFormDialog } from "@/components/vehicles/VehicleFormDialog";
import { useVehicle, useUpdateVehicle } from "@/hooks/useVehicles";
import { formatDate } from "@/lib/utils";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(id);
  const updateVehicle = useUpdateVehicle();
  const [editOpen, setEditOpen] = useState(false);

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
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" /> Maintenance history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vehicle.maintenance_history.length === 0 ? (
            <EmptyState title="No maintenance events" description="This vehicle has no reported issues." />
          ) : (
            <div className="divide-y divide-border">
              {vehicle.maintenance_history.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium">{m.description}</p>
                    <p className="text-xs text-muted-foreground">
                      reported {formatDate(m.created_at)}
                      {m.resolved_at ? ` · resolved ${formatDate(m.resolved_at)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> Ride history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vehicle.rental_history.length === 0 ? (
            <EmptyState title="No rides yet" description="This vehicle hasn't been rented out." />
          ) : (
            <div className="divide-y divide-border">
              {vehicle.rental_history.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium">{r.rider?.full_name ?? "Unknown rider"}</p>
                    <p className="text-xs text-muted-foreground">
                      started {formatDate(r.started_at)}
                      {r.ended_at ? ` · ended ${formatDate(r.ended_at)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
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
