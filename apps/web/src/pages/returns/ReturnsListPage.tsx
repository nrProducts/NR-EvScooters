import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePickupQueue } from "@/hooks/useBookings";
import { useSettlements } from "@/hooks/useReturns";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import type { PickupBooking, ReturnSettlement } from "@/types";

type ReturnsView = "pending" | "settled";

export default function ReturnsListPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ReturnsView>("pending");
  const [page, setPage] = useState(1);

  const pending = usePickupQueue(
    { status: "fulfilled", returnRequested: true, page, pageSize: 8 },
    { enabled: view === "pending" },
  );
  const settled = useSettlements({ page, pageSize: 8, sortBy: "created_at", sortDir: "desc" });

  const pendingColumns: DataTableColumn<PickupBooking>[] = [
    { header: "Rider", key: "rider", render: (b) => b.rider.full_name },
    {
      header: "Vehicle",
      key: "vehicle",
      render: (b) => (
        <div>
          <p className="font-medium">{b.vehicle?.registration_number ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{b.vehicle_model?.name ?? "—"}</p>
        </div>
      ),
    },
    {
      header: "Rental started",
      key: "started",
      render: (b) => (b.active_rental ? formatDate(b.active_rental.started_at) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Return requested",
      key: "return_requested",
      render: (b) => (b.active_rental?.return_requested_at ? formatDateTime(b.active_rental.return_requested_at) : "—"),
    },
    { header: "Status", key: "status", render: () => <StatusBadge status="return_requested" /> },
    {
      header: "Actions",
      key: "actions",
      render: (b) => (
        <Button size="sm" onClick={() => b.active_rental && navigate(`/returns/${b.active_rental.id}`)}>
          Review Return
        </Button>
      ),
    },
  ];

  const settledColumns: DataTableColumn<ReturnSettlement>[] = [
    {
      header: "Returned",
      key: "created_at",
      render: (s) => formatDateTime(s.created_at),
    },
    { header: "Deposit", key: "deposit_amount", render: (s) => formatCurrency(s.deposit_amount) },
    { header: "Total charges", key: "total_charges", render: (s) => formatCurrency(s.total_charges), hideOnMobile: true },
    {
      header: "Refund / Due",
      key: "amount",
      render: (s) => (
        s.refund_amount > 0
          ? <span className="text-success">Refund {formatCurrency(s.refund_amount)}</span>
          : s.due_amount > 0
            ? <span className="text-destructive">Due {formatCurrency(s.due_amount)}</span>
            : <span className="text-muted-foreground">Fully adjusted</span>
      ),
    },
    { header: "Status", key: "status", render: (s) => <StatusBadge status={s.status} /> },
    { header: "Processed by", key: "processed_by", render: (s) => s.processed_by?.full_name ?? "—", hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (s) => (
        <Button size="sm" variant="outline" onClick={() => navigate(`/returns/${s.rental_id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
        <p className="text-sm text-muted-foreground">Review pending returns and track their financial settlement.</p>
      </div>

      <Tabs value={view} onValueChange={(v) => { setView(v as ReturnsView); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="settled">Settled</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        {view === "pending" ? (
          <>
            <DataTable
              columns={pendingColumns}
              data={pending.data?.data ?? []}
              isLoading={pending.isLoading}
              isError={pending.isError}
              onRetry={() => pending.refetch()}
              emptyTitle="No pending return requests"
            />
            {pending.data && <Pagination page={page} pageSize={8} total={pending.data.total} onPageChange={setPage} />}
          </>
        ) : (
          <>
            <DataTable
              columns={settledColumns}
              data={settled.data?.data ?? []}
              isLoading={settled.isLoading}
              isError={settled.isError}
              onRetry={() => settled.refetch()}
              emptyTitle="No settlements yet"
            />
            {settled.data && <Pagination page={page} pageSize={8} total={settled.data.total} onPageChange={setPage} />}
          </>
        )}
      </Card>
    </div>
  );
}
