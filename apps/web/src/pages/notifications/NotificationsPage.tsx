import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Send } from "lucide-react";
import { Spinner } from "@/components/common/Spinner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useNotificationLog, useBroadcastNotification } from "@/hooks/useNotifications";
import { useMyNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useUnreadCount } from "@/hooks/useMyNotifications";
import { useNotificationTypeSummaries } from "@/hooks/useNotificationSettings";
import { useTableSort } from "@/hooks/useTableSort";
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { ApiError } from "@/services/api/httpClient";
import { formatDateTime, cn } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import { hasAction } from "@/lib/permissions";
import { notificationLink } from "@/lib/notificationLink";
import { useAuthStore } from "@/store/authStore";
import type { MyNotification, NotificationDeliveryStatus, NotificationLogEntry } from "@/types";

const STATUS_OPTIONS: (NotificationDeliveryStatus | "all")[] = ["all", "sent", "pending", "failed"];

/**
 * Every rider-facing template a `notifyUser()` call in the backend can raise
 * (grepped from every `template: "..."` literal outside notify.service.ts's
 * staff fan-out) — "admin_broadcast" excluded, that's its own tab. Labels are
 * just for the filter dropdown and the Type badge; the raw code still shows
 * as a fallback for anything added here later and not yet listed.
 */
const RIDER_NOTIFICATION_TYPE_LABEL: Record<string, string> = {
  vehicle_assigned: "Vehicle Assigned",
  rental_return_requested: "Return Requested",
  rental_completed: "Rental Completed",
  rental_return_rejected: "Return Rejected",
  kyc_approved: "KYC Approved",
  kyc_rejected: "KYC Rejected",
  payment_failed: "Payment Failed",
  payment_success: "Payment Successful",
  maintenance_plan_paused: "Plan Paused",
  vehicle_available_again: "Vehicle Available Again",
  refund_initiated: "Refund Initiated",
  refund_completed: "Refund Completed",
  damage_added: "Damage Charge Added",
  damage_dispute_resolved: "Damage Dispute Resolved",
  support_status_updated: "Support Ticket Updated",
  return_payment_required: "Return Payment Due",
  booking_cancelled: "Booking Cancelled",
  pickup_confirmed: "Pickup Confirmed",
  maintenance_quick_fix: "Maintenance — Quick Fix",
  maintenance_temp_vehicle: "Maintenance — Temp Vehicle",
  maintenance_vehicle_returned: "Maintenance — Vehicle Returned",
};

function riderNotificationTypeLabel(template: string): string {
  return RIDER_NOTIFICATION_TYPE_LABEL[template] ?? template;
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<"admin" | "riderLog" | "rider">("admin");
  const { data: unread } = useUnreadCount();

  usePageSubtitle("What you've sent to riders, and what riders' activity has sent to you.");

  return (
    <div className="space-y-4 animate-fade-in">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="admin">Sent by Admin</TabsTrigger>
          <TabsTrigger value="riderLog">Sent to Riders</TabsTrigger>
          <TabsTrigger value="rider">
            From Riders
            {!!unread && <Badge variant="destructive" className="ml-1.5 px-1.5 py-0 text-[0.625rem]">{unread}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "admin" && <AdminBroadcastTab />}
      {tab === "riderLog" && <RiderNotificationLogTab />}
      {tab === "rider" && <RiderActivityTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent by Admin — broadcasts composed here and pushed out to riders.
// ---------------------------------------------------------------------------

function AdminBroadcastTab() {
  const user = useAuthStore((s) => s.user);
  const canSendBroadcast = hasAction(user, "notifications", "send");
  const [status, setStatus] = useState<NotificationDeliveryStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useNotificationLog({
    status, notificationType: "admin_broadcast", page, pageSize: 8, sortBy: "created_at", sortDir: sort.dir,
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
    { header: "Sent", key: "sent_at", sortKey: "created_at", render: (n) => (n.sent_at ? formatDateTime(n.sent_at) : "—"), hideOnMobile: true },
  ];

  const canSend = title.trim() && body.trim() && canSendBroadcast;

  return (
    <div className="space-y-4">
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
          <p className="text-sm font-medium">{data?.total ?? 0} broadcasts logged</p>
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
          emptyTitle="No broadcasts sent yet"
          sort={sort}
          onSortChange={onSortChange}
        />

        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent to Riders — every system-generated notification a rider actually
// received (payment successful, payment/return amount due, return rejected,
// KYC decision, maintenance updates...), not just manual broadcasts. Same
// fleet-wide log endpoint as "Sent by Admin", just without pinning
// notificationType to "admin_broadcast".
// ---------------------------------------------------------------------------

const RIDER_NOTIFICATION_TYPES = Object.keys(RIDER_NOTIFICATION_TYPE_LABEL);

function RiderNotificationLogTab() {
  const [status, setStatus] = useState<NotificationDeliveryStatus | "all">("all");
  const [notificationType, setNotificationType] = useState<string | "all">("all");
  const [page, setPage] = useState(1);

  const { sort, onSortChange } = useTableSort("created_at", "desc");
  const { data, isLoading, isError, refetch } = useNotificationLog({
    status,
    notificationType: notificationType === "all" ? undefined : notificationType,
    page, pageSize: 8, sortBy: "created_at", sortDir: sort.dir,
  });

  const columns: DataTableColumn<NotificationLogEntry>[] = [
    {
      header: "Type",
      key: "type",
      render: (n) => <Badge variant="secondary">{riderNotificationTypeLabel(n.template)}</Badge>,
    },
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
    { header: "Sent", key: "sent_at", sortKey: "created_at", render: (n) => (n.sent_at ? formatDateTime(n.sent_at) : "—"), hideOnMobile: true },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">{data?.total ?? 0} notifications sent to riders</p>
        <div className="flex gap-2">
          <Select
            value={notificationType}
            onValueChange={(v) => { setNotificationType(v); setPage(1); }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {RIDER_NOTIFICATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{riderNotificationTypeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => { setStatus(v as NotificationDeliveryStatus | "all"); setPage(1); }}
          >
            <SelectTrigger className="w-40">
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
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyTitle="No notifications sent to riders yet"
        sort={sort}
        onSortChange={onSortChange}
      />

      {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// From Riders — booking, payment and return activity that reached this
// account because it's subscribed to that event type (Settings → Notification
// Manager). Same data the header bell shows, just the full list instead of
// the last 10.
// ---------------------------------------------------------------------------

function RiderActivityTab() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useMyNotifications({ page, pageSize: 10 });
  const { data: typeSummaries } = useNotificationTypeSummaries();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const typeLabel = (code: string) => typeSummaries?.find((t) => t.notification_type === code)?.label ?? code;

  const handleSelect = (n: MyNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    const target = notificationLink(n);
    if (target) navigate(target);
  };

  const columns: DataTableColumn<MyNotification>[] = [
    {
      header: "Event",
      key: "notification_type",
      render: (n) => <Badge variant="secondary">{typeLabel(n.notification_type ?? n.template)}</Badge>,
      hideOnMobile: true,
    },
    {
      header: "Message",
      key: "message",
      render: (n) => (
        <div className="flex min-w-0 items-start gap-2">
          {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          <div className="min-w-0">
            <p className={cn("truncate", !n.read_at ? "font-semibold" : "font-medium")}>{n.payload?.title ?? n.template}</p>
            <p className="truncate text-xs text-muted-foreground">{n.payload?.body ?? ""}</p>
          </div>
        </div>
      ),
    },
    { header: "Received", key: "created_at", render: (n) => formatDateTime(n.created_at), hideOnMobile: true },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">{data?.total ?? 0} notifications from rider activity</p>
        <Button
          size="sm"
          variant="outline"
          disabled={markAllRead.isPending}
          onClick={() =>
            markAllRead.mutate(undefined, {
              onSuccess: () => toastSuccess("All caught up"),
              onError: (err) => toastError(err, "Could not mark all as read"),
            })
          }
        >
          Mark all read
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyTitle="No booking, payment or return activity yet"
        onRowClick={handleSelect}
      />

      {data && <Pagination page={page} pageSize={10} total={data.total} onPageChange={setPage} />}
    </Card>
  );
}
