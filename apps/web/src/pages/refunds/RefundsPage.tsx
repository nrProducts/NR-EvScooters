import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useRefunds, useRetryRefund } from "@/hooks/useRefunds";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Refund, RefundStatus } from "@/types";

const STATUS_OPTIONS: (RefundStatus | "all")[] = ["all", "pending", "processing", "success", "failed"];

export default function RefundsPage() {
  const [status, setStatus] = useState<RefundStatus | "all">("all");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useRefunds({ status, page, pageSize: 8 });
  const retry = useRetryRefund();

  const columns: DataTableColumn<Refund>[] = [
    { header: "Amount", key: "amount", render: (r) => formatCurrency(r.amount) },
    { header: "Status", key: "status", render: (r) => <StatusBadge status={r.status} /> },
    { header: "Attempts", key: "attempt_count", render: (r) => r.attempt_count, hideOnMobile: true },
    { header: "Initiated", key: "initiated_at", render: (r) => formatDate(r.initiated_at) },
    { header: "Processed", key: "processed_at", render: (r) => (r.processed_at ? formatDate(r.processed_at) : "—"), hideOnMobile: true },
    {
      header: "Failure reason",
      key: "failure_reason",
      render: (r) => <span className="text-xs text-destructive">{r.failure_reason ?? "—"}</span>,
      hideOnMobile: true,
    },
    {
      header: "Actions",
      key: "actions",
      render: (r) =>
        r.status === "failed" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            onClick={(e) => {
              e.stopPropagation();
              retry.mutate(r.id);
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Refund Queue</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} deposit refunds</p>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as RefundStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No refunds match your filters"
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
