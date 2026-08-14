import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, "success" | "warning" | "destructive" | "secondary" | "muted" | "outline" | "info"> = {
  available: "success",
  active: "success",
  approved: "success",
  completed: "success",
  sent: "success",
  success: "success",
  current: "info",
  booked: "info",
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
  scrap: "muted",
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
  partially_refunded: "secondary",
  forfeited: "destructive",
  recorded: "warning",
  disputed: "destructive",
  paused: "warning",
  due: "warning",
  return_requested: "warning",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_STYLES[status] ?? "secondary";
  const label = status.replace(/_/g, " ");
  return <Badge variant={variant} className="capitalize">{label}</Badge>;
}
