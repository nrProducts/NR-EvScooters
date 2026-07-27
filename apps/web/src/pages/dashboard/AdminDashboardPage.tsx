import { Users, ShieldCheck, PackageCheck, LifeBuoy, Bike, IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { NotConnected } from "@/components/common/NotConnected";
import { Skeleton } from "@/components/ui/skeleton";
import { useRiders } from "@/hooks/useRiders";
import { usePickupQueue } from "@/hooks/useBookings";
import { useSupportQueue } from "@/hooks/useSupport";

export default function AdminDashboardPage() {
  // Each of these fetches page 1 with pageSize=1 just to read `.total` off
  // the pagination envelope — cheap way to get a real count without a
  // dedicated aggregate endpoint (which the backend doesn't have yet).
  const { data: allRiders, isLoading: ridersLoading } = useRiders({ page: 1, pageSize: 1 });
  const { data: pendingKyc, isLoading: pendingLoading } = useRiders({ page: 1, pageSize: 1, kycStatus: "pending" });
  const { data: verifiedKyc, isLoading: verifiedLoading } = useRiders({ page: 1, pageSize: 1, kycStatus: "verified" });
  const { data: pickups, isLoading: pickupsLoading } = usePickupQueue({ pageSize: 1 });
  const { data: openTickets, isLoading: ticketsLoading } = useSupportQueue({ status: "open", pageSize: 1 });

  const isLoading = ridersLoading || pendingLoading || verifiedLoading || pickupsLoading || ticketsLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="text-sm text-muted-foreground">Real counts from the backend — no fabricated numbers</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Riders" value={allRiders?.total ?? 0} icon={Users} />
          <StatCard label="Pending KYC" value={pendingKyc?.total ?? 0} icon={ShieldCheck} tone="warning" />
          <StatCard label="Verified KYC" value={verifiedKyc?.total ?? 0} icon={ShieldCheck} tone="success" />
          <StatCard label="Awaiting pickup" value={pickups?.total ?? 0} icon={PackageCheck} />
          <StatCard label="Open support tickets" value={openTickets?.total ?? 0} icon={LifeBuoy} tone="warning" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bike className="h-4 w-4" /> Fleet status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <NotConnected
              title="No fleet inventory API yet"
              description="Vehicle counts by status, battery health and utilization all need a vehicles endpoint that doesn't exist yet."
              missingEndpoints={["GET /vehicles"]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4" /> Revenue
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <NotConnected
              title="No payments/invoices API yet"
              description="Today's/weekly/monthly revenue and outstanding payments need an invoices endpoint that doesn't exist yet."
              missingEndpoints={["GET /invoices"]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
