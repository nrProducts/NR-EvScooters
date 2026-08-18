import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useMyNotifications, useUnreadCount, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/useMyNotifications";
import { subscribeNotificationBell, unsubscribeNotificationBell } from "@/lib/notificationRealtime";
import { timeAgo, cn } from "@/lib/utils";
import type { MyNotification } from "@/types";

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unread } = useUnreadCount();
  const { data: recent } = useMyNotifications({ page: 1, pageSize: 10 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    subscribeNotificationBell(() => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
      qc.invalidateQueries({ queryKey: ["my-notifications-unread-count"] });
    });
    return () => unsubscribeNotificationBell();
  }, [qc]);

  const handleSelect = (n: MyNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.payload?.screen) navigate(n.payload.screen);
  };

  const count = unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {count > 0 && (
            <button
              type="button"
              className="text-xs font-normal text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                markAllRead.mutate();
              }}
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {!recent || recent.data.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            recent.data.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn("flex-col items-start gap-0.5 whitespace-normal py-2", !n.read_at && "bg-secondary/60")}
                onClick={() => handleSelect(n)}
              >
                <span className="text-sm font-medium">{n.payload?.title ?? "Notification"}</span>
                {n.payload?.body && <span className="text-xs text-muted-foreground">{n.payload.body}</span>}
                <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/notifications")} className="justify-center text-sm text-primary">
          View all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
