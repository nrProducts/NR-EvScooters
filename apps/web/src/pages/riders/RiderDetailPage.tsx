import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Timeline } from "@/components/common/Timeline";
import { ErrorState } from "@/components/common/ErrorState";
import { useRider } from "@/hooks/useRiders";
import { useBookings } from "@/hooks/useBookings";
import { useTransactions } from "@/hooks/usePayments";
import { initials, formatDate, formatCurrency } from "@/lib/utils";

export default function RiderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rider, isLoading, isError, refetch } = useRider(id);
  const { data: bookings } = useBookings({ pageSize: 20 });
  const { data: transactions } = useTransactions({ pageSize: 20 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError || !rider) return <ErrorState message="Rider not found." onRetry={() => refetch()} />;

  const rideHistory = (bookings?.data ?? []).filter((b) => b.riderId === rider.id);
  const paymentHistory = (transactions?.data ?? []).filter((t) => t.riderId === rider.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/riders")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={rider.avatarUrl} alt={rider.name} />
          <AvatarFallback>{initials(rider.name)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{rider.name}</h1>
          <p className="text-sm text-muted-foreground">Joined {formatDate(rider.joinedOn)}</p>
        </div>
        <StatusBadge status={rider.kycStatus} />
        {rider.violations > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <ShieldAlert className="h-3.5 w-3.5" /> {rider.violations} violation(s)
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Detail icon={Phone} label="Phone" value={rider.phone} />
            <Detail icon={Mail} label="Email" value={rider.email ?? "Not provided"} />
            <Detail icon={MapPin} label="Address" value={rider.address ?? "Not provided"} />
            <Detail icon={Phone} label="Emergency contact" value={rider.emergencyContact ?? "Not provided"} />
            <Detail icon={ShieldAlert} label="Driving licence" value={rider.licenseNumber ?? "Not verified"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wallet &amp; activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stat label="Wallet balance" value={formatCurrency(rider.walletBalance)} />
            <Stat label="Total rides" value={rider.totalRides} />
            <Stat label="Violations" value={rider.violations} />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rides">
        <TabsList>
          <TabsTrigger value="rides">Ride history</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>
        </TabsList>

        <TabsContent value="rides">
          <Card>
            <CardContent className="p-5">
              {rideHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No ride history yet.</p>
              ) : (
                <Timeline
                  items={rideHistory.map((b) => ({
                    id: b.id,
                    title: `${b.vehicleReg} — ${b.plan} plan`,
                    timestamp: formatDate(b.startDate),
                    description: `${formatCurrency(b.amount)} · ${b.status}`,
                    tone: b.status === "completed" ? "success" : b.status === "cancelled" ? "destructive" : "default",
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-5">
              {paymentHistory.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No payment history yet.</p>
              ) : (
                <Timeline
                  items={paymentHistory.map((t) => ({
                    id: t.id,
                    title: `${t.type.replace(/_/g, " ")} — ${formatCurrency(Math.abs(t.amount))}`,
                    timestamp: formatDate(t.date),
                    description: t.invoiceId,
                    tone: t.status === "success" ? "success" : t.status === "failed" ? "destructive" : "warning",
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
