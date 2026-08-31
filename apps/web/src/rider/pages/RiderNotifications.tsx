import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/EmptyState";
import { CenteredSpinner } from "@/rider/components/common";
import { useMyNotifications } from "@/rider/hooks/queries";
import { riderApi } from "@/rider/services/riderApi";
import { formatDate } from "@/rider/constants/status";

// Web browsers can't reuse native push; this is the in-app notification list.
export default function RiderNotifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useMyNotifications();

  if (isLoading) return <CenteredSpinner />;
  const items = data?.data ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  const markAllRead = async () => {
    await riderApi.markAllNotificationsRead();
    qc.invalidateQueries({ queryKey: ["rider", "notifications"] });
  };

  const open = async (id: string, screen?: string) => {
    await riderApi.markNotificationRead(id);
    qc.invalidateQueries({ queryKey: ["rider", "notifications"] });
    if (screen?.startsWith("/")) {
      const mapped = screen === "/billing" ? "/rider/billing" : screen.startsWith("/rider") ? screen : `/rider${screen}`;
      navigate(mapped);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Notifications</h1>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n.id, n.payload?.screen)}
              className={`flex w-full flex-col gap-1 rounded-lg border p-4 text-left ${
                n.read_at ? "border-border" : "border-primary/40 bg-primary/5"
              }`}
            >
              <p className="text-sm font-semibold">{n.payload?.title ?? n.template}</p>
              {n.payload?.body && <p className="text-xs text-muted-foreground">{n.payload.body}</p>}
              <p className="text-[11px] text-muted-foreground">{formatDate(n.created_at)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
