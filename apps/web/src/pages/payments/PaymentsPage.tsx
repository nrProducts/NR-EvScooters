import { useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/common/StatCard";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useTransactions, useIssueRefund } from "@/hooks/usePayments";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PaymentStatus, Transaction } from "@/types";

const TABS: { value: PaymentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "success", label: "Success" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export default function PaymentsPage() {
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [refundTarget, setRefundTarget] = useState<Transaction | null>(null);

  const { data, isLoading, isError, refetch } = useTransactions({ status, page, pageSize: 10 });
  const { data: summary } = useDashboardSummary();
  const issueRefund = useIssueRefund();

  const columns: DataTableColumn<Transaction>[] = [
    { header: "Invoice", key: "invoice", render: (t) => t.invoiceId ?? "—" },
    { header: "Rider", key: "rider", render: (t) => t.riderName },
    { header: "Type", key: "type", render: (t) => <span className="capitalize">{t.type.replace(/_/g, " ")}</span>, hideOnMobile: true },
    { header: "Date", key: "date", render: (t) => formatDate(t.date), hideOnMobile: true },
    {
      header: "Amount",
      key: "amount",
      render: (t) => (
        <span className={t.amount < 0 ? "text-destructive" : ""}>{formatCurrency(t.amount)}</span>
      ),
    },
    { header: "Status", key: "status", render: (t) => <StatusBadge status={t.status} /> },
    {
      header: "Actions",
      key: "actions",
      render: (t) =>
        t.status === "success" ? (
          <Button size="sm" variant="outline" onClick={() => setRefundTarget(t)}>
            <RotateCcw className="h-3.5 w-3.5" /> Refund
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">Revenue, transactions and refunds</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Download className="h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Revenue Today" value={formatCurrency(summary.revenue.today)} />
          <StatCard label="Revenue This Week" value={formatCurrency(summary.revenue.thisWeek)} />
          <StatCard label="Revenue This Month" value={formatCurrency(summary.revenue.thisMonth)} />
          <StatCard label="Outstanding" value={formatCurrency(summary.revenue.outstanding)} tone="destructive" />
        </div>
      )}

      <Tabs value={status} onValueChange={(v) => { setStatus(v as PaymentStatus | "all"); setPage(1); }}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
            emptyTitle="No transactions found"
          />
        </CardContent>
        {data && <Pagination page={page} pageSize={10} total={data.total} onPageChange={setPage} />}
      </Card>

      <ConfirmDialog
        open={!!refundTarget}
        onOpenChange={(o) => !o && setRefundTarget(null)}
        title={`Refund ${refundTarget ? formatCurrency(refundTarget.amount) : ""}?`}
        description={`This will refund ${refundTarget?.riderName} for invoice ${refundTarget?.invoiceId}.`}
        confirmLabel="Issue refund"
        loading={issueRefund.isPending}
        onConfirm={() => {
          if (refundTarget) issueRefund.mutate(refundTarget.id, { onSuccess: () => setRefundTarget(null) });
        }}
      />
    </div>
  );
}
