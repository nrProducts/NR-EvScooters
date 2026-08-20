import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, "success" | "warning" | "destructive" | "secondary" | "muted" | "outline" | "info"> = {
  available: "success",
  active: "success",
  approved: "success",
  completed: "success",
  sent: "success",
  success: "success",
  current: "info",
  reserved: "info",
  in_progress: "info",
  scheduled: "info",
  assigned: "info",
  pending: "warning",
  upcoming: "warning",
  charging: "warning",
  low: "muted",
  medium: "warning",
  high: "destructive",
  rejected: "destructive",
  cancelled: "destructive",
  failed: "destructive",
  maintenance: "destructive",
  offline: "muted",
  retired: "muted",
  refunded: "secondary",
  draft: "muted",
  on_leave: "muted",
  open: "warning",
  // real backend status values
  verified: "success",
  resolved: "success",
  fulfilled: "success",
  not_submitted: "muted",
  partially_verified: "warning",
  confirmed: "info",
  pending_payment: "warning",
  expired: "destructive",
  urgent: "destructive",
  suspended: "destructive",
  inactive: "muted",
  closed: "muted",
  // roles (Users screen)
  admin: "info",
  rider: "secondary",
  staff: "outline",
  // payments/plans/deposits/damages/refunds
  processing: "info",
  held: "info",
  released: "success",
  forfeited: "destructive",
  recorded: "warning",
  disputed: "destructive",
  paused: "warning",
  due: "warning",
  return_requested: "warning",
  // booking cancellation refund_status (distinct from refunds.status above)
  processed: "success",
  not_required: "muted",
  // return_settlements.status
  pending_refund: "warning",
  refund_processing: "info",
  refund_completed: "success",
  no_refund_required: "muted",
  amount_due: "destructive",
  settlement_completed: "success",
  // Invoice payment state — DERIVED from the allocations, not a column.
  // `succeeded` used to appear here for the departed `invoices.payment_status`;
  // these four replace it. `paid` and `overdue` are deliberately NOT invoice
  // statuses: `invoice_status` has three values and none of them is about
  // money having moved.
  paid: "success",
  partial: "warning",
  overdue: "destructive",
  unpaid: "muted",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_STYLES[status] ?? "secondary";
  const label = status.replace(/_/g, " ");
  return <Badge variant={variant} className="capitalize">{label}</Badge>;
}
