import { useState } from "react";
import { Eye, MoreHorizontal, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Link, useSearchParams } from "react-router-dom";
import { useInvoices, useInvoice, useRefundInvoice } from "@/hooks/usePayments";
import { useTableSort } from "@/hooks/useTableSort";
import { ApiError } from "@/services/api/httpClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { Invoice, InvoiceStatus, PaymentStatus, PaymentType } from "@/types";

const STATUS_OPTIONS: (InvoiceStatus | "all")[] = ["all", "draft", "issued", "paid", "overdue", "void"];
const PAYMENT_STATUS_OPTIONS: (PaymentStatus | "all")[] = [
  "all", "pending", "processing", "succeeded", "failed", "refunded",
];
const PAYMENT_TYPE_OPTIONS: (PaymentType | "all")[] = [
  "all", "rental", "deposit", "damage", "penalty", "refund", "other",
];

export default function PaymentsPage() {
  const user = useAuthStore((s) => s.user);
  const canRefund = hasAction(user, "payments", "refund");
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get("bookingId") ?? undefined;
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "all">("all");
  const [paymentType, setPaymentType] = useState<PaymentType | "all">("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<Invoice | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useInvoices({
    status, paymentStatus, paymentType, bookingId, page, pageSize: 8,
    sortBy: sort.by as "created_at" | "amount_due" | "due_date", sortDir: sort.dir,
  });

  const columns: DataTableColumn<Invoice>[] = [
    {
      header: "Rider",
      key: "rider",
      render: (inv) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{inv.rider?.full_name ?? "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{inv.rider?.email ?? ""}</p>
        </div>
      ),
    },
    {
      header: "Type",
      key: "payment_type",
      render: (inv) => <span className="capitalize text-sm">{inv.payment_type ?? "—"}</span>,
    },
    { header: "Amount", key: "amount", sortKey: "amount_due", render: (inv) => formatCurrency(inv.amount_due) },
    { header: "Status", key: "status", render: (inv) => <StatusBadge status={inv.status} /> },
    { header: "Payment", key: "payment_status", render: (inv) => <StatusBadge status={inv.payment_status} /> },
    { header: "Due", key: "due_date", sortKey: "due_date", render: (inv) => formatDate(inv.due_date), hideOnMobile: true },
    { header: "Created", key: "created_at", sortKey: "created_at", render: (inv) => formatDate(inv.created_at), hideOnMobile: true },
    {
      header: "Actions",
      key: "actions",
      render: (inv) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => setDetailId(inv.id)}>
              <Eye className="mr-2 h-4 w-4" /> View details
            </DropdownMenuItem>
            {inv.payment_status === "succeeded" && canRefund && (
              <DropdownMenuItem onClick={() => setRefundTarget(inv)}>
                <Undo2 className="mr-2 h-4 w-4" /> Refund
              </DropdownMenuItem>
            )}
            {inv.booking_id && (
              <DropdownMenuItem asChild>
                <Link to={`/payments?bookingId=${inv.booking_id}`} onClick={(e) => e.stopPropagation()}>
                  <Eye className="mr-2 h-4 w-4" /> View payment history
                </Link>
              </DropdownMenuItem>
            )}
            {inv.booking_id && inv.payment_type === "damage" && (
              <DropdownMenuItem asChild>
                <Link to={`/damages?bookingId=${inv.booking_id}`} onClick={(e) => e.stopPropagation()}>
                  <Eye className="mr-2 h-4 w-4" /> View damage
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {data?.total ?? 0} invoices · revenue, transactions and refunds
            {bookingId && (
              <>
                {" · filtered to one booking — "}
                <Link to="/payments" className="underline">clear</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/damages">Damages</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/refunds">Refunds</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/plans">Plans</Link>
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={paymentType}
            onValueChange={(v) => {
              setPaymentType(v as PaymentType | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Payment type" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t === "all" ? "All payment types" : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as InvoiceStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Invoice status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All invoice statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={paymentStatus}
            onValueChange={(v) => {
              setPaymentStatus(v as PaymentStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Payment status" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s === "all" ? "All payment statuses" : s}
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
          onRowClick={(inv) => setDetailId(inv.id)}
          emptyTitle="No invoices match your filters"
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      <InvoiceDetailDialog
        id={detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        onRefund={(inv) => {
          setDetailId(null);
          setRefundTarget(inv);
        }}
        canRefund={canRefund}
      />

      <RefundDialog invoice={refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)} />
    </div>
  );
}

function InvoiceDetailDialog({
  id,
  onOpenChange,
  onRefund,
  canRefund,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
  onRefund: (invoice: Invoice) => void;
  canRefund: boolean;
}) {
  const { data: invoice, isLoading } = useInvoice(id ?? undefined);

  return (
    <Dialog open={!!id} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invoice</DialogTitle>
        </DialogHeader>

        {isLoading || !invoice ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <Row label="Rider" value={invoice.rider?.full_name ?? "—"} />
            {invoice.items.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-border p-3">
                {invoice.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs">
                    <span className={item.item_type === "discount" ? "text-success" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                    <span className="font-medium">
                      {item.item_type === "discount" ? "-" : ""}{formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(invoice.amount_due)}</span>
                </div>
              </div>
            ) : (
              <Row label="Amount due" value={formatCurrency(invoice.amount_due)} />
            )}
            <Row label="Invoice status" value={<StatusBadge status={invoice.status} />} />
            <Row label="Payment status" value={<StatusBadge status={invoice.payment_status} />} />
            <Row label="Payment method" value={invoice.payment_method ?? "—"} />
            <Row label="Gateway reference" value={invoice.gateway_ref ?? "—"} />
            <Row label="Due date" value={formatDate(invoice.due_date)} />
            <Row label="Paid at" value={invoice.paid_at ? formatDate(invoice.paid_at) : "—"} />
            <Row label="Plan" value={invoice.plan?.name ?? "—"} />
            <Row label="Vehicle" value={invoice.vehicle ? `${invoice.vehicle.name} (${invoice.vehicle.registration_number})` : "—"} />
          </div>
        )}

        <DialogFooter>
          {invoice?.payment_status === "succeeded" && canRefund && (
            <Button variant="outline" onClick={() => onRefund(invoice)}>
              <Undo2 className="h-4 w-4" /> Refund
            </Button>
          )}
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ invoice, onOpenChange }: { invoice: Invoice | null; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState("");
  const refund = useRefundInvoice();

  return (
    <Dialog
      open={!!invoice}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReason("");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {invoice ? formatCurrency(invoice.amount_due) : ""}?</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          This marks the invoice as refunded in our records without a separate gateway call. For a booking
          cancellation or security-deposit refund that needs to actually move money, use the{" "}
          <Link to="/refunds" className="underline">Refunds page</Link> instead.
        </p>

        <div className="space-y-1.5">
          <Label>Reason (optional)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>

        {refund.isError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {refund.error instanceof ApiError ? refund.error.message : "Something went wrong."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={refund.isPending}
            onClick={() => {
              if (invoice) {
                refund.mutate(
                  { id: invoice.id, reason: reason.trim() || undefined },
                  { onSuccess: () => onOpenChange(false) },
                );
              }
            }}
          >
            {refund.isPending ? "Please wait..." : "Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
