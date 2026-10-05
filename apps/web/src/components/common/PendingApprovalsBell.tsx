import { useNavigate } from "react-router-dom";
import { ClipboardCheck, IdCard, Undo2, LifeBuoy, Wrench, Wallet, CalendarClock, PackageCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { usePendingApprovals } from "@/hooks/useReports";
import type { PendingApprovalsSummary } from "@/types";

interface PendingItem {
  key: keyof PendingApprovalsSummary;
  label: string;
  path: string;
  icon: typeof IdCard;
}

const PENDING_ITEMS: PendingItem[] = [
  { key: "signups_pending", label: "New account registrations", path: "/users?tab=pending", icon: UserPlus },
  { key: "bookings_awaiting_pickup", label: "Bookings awaiting pickup", path: "/bookings", icon: PackageCheck },
  { key: "kyc_pending", label: "KYC reviews", path: "/kyc", icon: IdCard },
  { key: "returns_pending", label: "Returns awaiting action", path: "/bookings?tab=return_requests", icon: Undo2 },
  { key: "support_open", label: "Open support tickets", path: "/support", icon: LifeBuoy },
  { key: "maintenance_pending", label: "Maintenance tickets", path: "/maintenance", icon: Wrench },
  { key: "refunds_pending", label: "Refunds pending", path: "/refunds", icon: Wallet },
  { key: "leave_pending", label: "Leave requests", path: "/leave", icon: CalendarClock },
];

/**
 * Everything currently awaiting an admin decision, fleet-wide — distinct from
 * NotificationBell, which is a chronological activity feed (read/unread) and
 * can go quiet even while real work is still sitting open. This one always
 * reflects the actual current backlog: what's pending right now, not what
 * was ever announced. Polled (see usePendingApprovals) rather than realtime,
 * since it spans six modules with no single event stream to subscribe to.
 */
export function PendingApprovalsBell() {
  const navigate = useNavigate();
  const { data } = usePendingApprovals();

  const items = PENDING_ITEMS
    .map((item) => ({ ...item, count: data?.[item.key] ?? 0 }))
    .filter((item) => item.count > 0);
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Pending approvals">
              <ClipboardCheck className="h-[1.125rem] w-[1.125rem]" />
              {total > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[0.625rem] font-semibold leading-none text-warning-foreground">
                  {total > 99 ? "99+" : total}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {total > 0 ? `Pending approvals (${total})` : "Pending approvals"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Pending Approvals</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nothing pending — you're all caught up.</p>
        ) : (
          items.map(({ key, label, path, icon: Icon, count }) => (
            <DropdownMenuItem
              key={key}
              className="flex items-center justify-between gap-2"
              onClick={() => navigate(path)}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {label}
              </span>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/15 px-1.5 text-xs font-semibold text-warning">
                {count}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
