import { Bike, IndianRupee, Users, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/common/StatCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { useReportsSummary } from "@/hooks/useReports";
import { formatCurrency } from "@/lib/utils";

export default function ReportsPage() {
  const { data, isLoading, isError, refetch } = useReportsSummary();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Fleet, rider and revenue snapshot — computed live from the database</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Fleet size" value={data.vehicles.total} icon={Bike} />
        <StatCard label="Riders" value={data.riders.total} icon={Users} />
        <StatCard label="Revenue collected" value={formatCurrency(data.revenue.paid_total)} icon={IndianRupee} tone="success" />
        <StatCard label="Outstanding" value={formatCurrency(data.revenue.pending_total)} icon={IndianRupee} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bike className="h-4 w-4" /> Fleet status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.vehicles.by_status).map(([status, count]) => (
              <StatusRow key={status} status={status} count={count} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Rider KYC status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.riders.by_kyc_status).map(([status, count]) => (
              <StatusRow key={status} status={status} count={count} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Maintenance tickets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.maintenance.by_status).map(([status, count]) => (
              <StatusRow key={status} status={status} count={count} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4" /> Revenue breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Paid" value={formatCurrency(data.revenue.paid_total)} />
            <Row label="Pending" value={formatCurrency(data.revenue.pending_total)} />
            <Row label="Refunded" value={formatCurrency(data.revenue.refunded_total)} />
            <Row label="Total invoices" value={String(data.revenue.invoice_count)} />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Per-repair maintenance cost isn't shown — the database doesn't track a cost on maintenance tickets yet.
        Revenue is computed live from invoices rather than a fixed daily/weekly/monthly trend.
      </p>
    </div>
  );
}

function StatusRow({ status, count }: { status: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <StatusBadge status={status} />
      <span className="font-medium">{count}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
