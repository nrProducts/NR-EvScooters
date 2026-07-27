import { Badge } from "@/components/ui/badge";

const STATUS_STYLES: Record<string, "success" | "warning" | "destructive" | "secondary" | "muted" | "outline"> = {
  available: "success",
  active: "success",
  approved: "success",
  completed: "success",
  sent: "success",
  success: "success",
  current: "outline",
  booked: "outline",
  in_progress: "outline",
  scheduled: "outline",
  assigned: "outline",
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
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_STYLES[status] ?? "secondary";
  const label = status.replace(/_/g, " ");
  return <Badge variant={variant} className="capitalize">{label}</Badge>;
}
