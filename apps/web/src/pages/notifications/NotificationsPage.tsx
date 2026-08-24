import { useState } from "react";
import { Bell, Send } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useNotificationLog, useBroadcastNotification } from "@/hooks/useNotifications";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import { formatDate } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { hasAction } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";
import type { NotificationDeliveryStatus, NotificationLogEntry } from "@/types";

const STATUS_OPTIONS: (NotificationDeliveryStatus | "all")[] = ["all", "sent", "pending", "failed"];

export default function NotificationsPage() {
  const user = useAuthStore((s) => s.user);
  const canSendBroadcast = hasAction(user, "notifications", "send");
  const [status, setStatus] = useState<NotificationDeliveryStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useNotificationLog({
    status, page, pageSize: 8, sortBy: "created_at", sortDir: sort.dir,
  });
  const broadcast = useBroadcastNotification();

  const columns: DataTableColumn<NotificationLogEntry>[] = [
    {
      header: "Message",
      key: "message",
      render: (n) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{n.payload?.title ?? n.template}</p>
          <p className="truncate text-xs text-muted-foreground">{n.payload?.body ?? ""}</p>
        </div>
      ),
    },
    { header: "Rider", key: "rider", render: (n) => n.rider?.full_name ?? "—" },
    { header: "Channel", key: "channel", render: (n) => <span className="capitalize">{n.channel}</span>, hideOnMobile: true },
    { header: "Status", key: "status", render: (n) => <StatusBadge status={n.status} /> },
    { header: "Sent", key: "sent_at", sortKey: "created_at", render: (n) => (n.sent_at ? formatDate(n.sent_at) : "—"), hideOnMobile: true },
  ];

  const canSend = title.trim() && body.trim() && canSendBroadcast;

  usePageSubtitle("Push notifications sent to riders — SMS/email aren't wired up yet");

  return (
    <div className="space-y-4 animate-fade-in">
      <Card>
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Send className="h-4 w-4" /> Compose a broadcast
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monsoon safety advisory" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </div>
          <p className="text-xs text-muted-foreground">Sends to every active rider with the app installed.</p>

          {broadcast.isError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {broadcast.error instanceof ApiError ? broadcast.error.message : "Something went wrong."}
            </p>
          )}
          {result && <p className="rounded-md bg-primary/10 px-3 py-2 text-xs text-primary">{result}</p>}

          <Button
            disabled={!canSend || broadcast.isPending}
            onClick={() =>
              broadcast.mutate(
                { title: title.trim(), body: body.trim() },
                {
                  onSuccess: (res) => {
                    const message = `Sent to ${res.sent} of ${res.targeted} riders (${res.failed} failed).`;
                    setResult(message);
                    toastSuccess("Broadcast sent", message);
                    setTitle("");
                    setBody("");
                  },
                  onError: (err) => toastError(err, "Could not send broadcast"),
                },
              )
            }
          >
            {broadcast.isPending && <Spinner className="h-4 w-4" />}
            <Bell className="h-4 w-4" /> Send broadcast
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">{data?.total ?? 0} notifications logged</p>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as NotificationDeliveryStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-52">
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
          emptyTitle="No notifications sent yet"
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
