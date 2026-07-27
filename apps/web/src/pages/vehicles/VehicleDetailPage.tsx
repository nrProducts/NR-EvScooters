import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, QrCode, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { BatteryIndicator } from "@/components/common/BatteryIndicator";
import { Timeline } from "@/components/common/Timeline";
import { ErrorState } from "@/components/common/ErrorState";
import { useVehicle } from "@/hooks/useVehicles";
import { useBookings } from "@/hooks/useBookings";
import { useMaintenanceTickets } from "@/hooks/useMaintenance";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: vehicle, isLoading, isError, refetch } = useVehicle(id);
  const { data: bookings } = useBookings({ search: vehicle?.registrationNumber, pageSize: 10 });
  const { data: maintenance } = useMaintenanceTickets({ pageSize: 20 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !vehicle) return <ErrorState message="Vehicle not found." onRetry={() => refetch()} />;

  const rideHistory = (bookings?.data ?? []).filter((b) => b.vehicleId === vehicle.id);
  const maintenanceHistory = (maintenance?.data ?? []).filter((m) => m.vehicleId === vehicle.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/vehicles")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{vehicle.registrationNumber}</h1>
          <p className="text-sm text-muted-foreground">{vehicle.model}</p>
        </div>
        <StatusBadge status={vehicle.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vehicle details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Detail label="VIN" value={vehicle.vin} />
            <Detail label="IMEI" value={vehicle.imei} />
            <Detail label="Insurance expiry" value={formatDate(vehicle.insuranceExpiry)} />
            <Detail label="Registration expiry" value={formatDate(vehicle.registrationExpiry)} />
            <Detail label="Added on" value={formatDate(vehicle.addedOn)} />
            <Detail label="GPS" value={vehicle.gpsOnline ? "Online" : "Offline"} />
            <div>
              <p className="text-xs text-muted-foreground">Battery</p>
              <BatteryIndicator percent={vehicle.batteryPercent} className="mt-1" />
            </div>
            <Detail label="Odometer" value={`${vehicle.odometerKm.toLocaleString()} km`} />
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="mt-1 flex items-center gap-1 font-medium">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {vehicle.station}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-4 w-4" /> QR code
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="grid h-36 w-36 grid-cols-6 grid-rows-6 gap-0.5 rounded-md bg-foreground p-2">
              {Array.from({ length: 36 }).map((_, i) => (
                <div key={i} className={`rounded-sm ${(i * 7) % 5 === 0 ? "bg-background" : "bg-transparent"}`} />
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Scan to open vehicle details in the rider app
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rides">
        <TabsList>
          <TabsTrigger value="rides">Ride history</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance history</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="rides">
          <Card>
            <CardContent className="p-5">
              {rideHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No ride history for this vehicle yet.</p>
              ) : (
                <Timeline
                  items={rideHistory.map((b) => ({
                    id: b.id,
                    title: `${b.riderName} — ${b.plan} plan (${formatCurrency(b.amount)})`,
                    timestamp: formatDate(b.startDate),
                    description: `Status: ${b.status}`,
                    tone: b.status === "completed" ? "success" : b.status === "cancelled" ? "destructive" : "default",
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <Card>
            <CardContent className="p-5">
              {maintenanceHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No maintenance tickets recorded.</p>
              ) : (
                <Timeline
                  items={maintenanceHistory.map((m) => ({
                    id: m.id,
                    title: m.issue,
                    timestamp: formatDate(m.reportedOn),
                    description: m.technician ? `Handled by ${m.technician}` : "Awaiting assignment",
                    tone: m.status === "completed" ? "success" : m.priority === "high" ? "destructive" : "warning",
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
              {["Insurance certificate", "Registration certificate (RC)", "Fitness certificate"].map((doc) => (
                <div key={doc} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{doc}</p>
                    <p className="text-xs text-muted-foreground">PDF · uploaded</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}
