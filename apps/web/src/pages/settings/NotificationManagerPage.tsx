import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/common/ErrorState";
import { useNotificationSettings, useUpdateNotificationSetting } from "@/hooks/useNotificationSettings";
import { useUsers } from "@/hooks/useUsers";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from "@/types";
import type { NotificationSetting, NotificationType } from "@/types";

interface PendingState {
  enabled: boolean;
  send_email: boolean;
  send_in_app: boolean;
  recipient_user_ids: string[];
}

function toPending(setting: NotificationSetting): PendingState {
  return {
    enabled: setting.enabled,
    send_email: setting.send_email,
    send_in_app: setting.send_in_app,
    recipient_user_ids: setting.recipients.map((r) => r.user_id),
  };
}

function isDirty(a: PendingState, b: PendingState): boolean {
  return a.enabled !== b.enabled
    || a.send_email !== b.send_email
    || a.send_in_app !== b.send_in_app
    || JSON.stringify([...a.recipient_user_ids].sort()) !== JSON.stringify([...b.recipient_user_ids].sort());
}

export default function NotificationManagerPage() {
  const navigate = useNavigate();
  const { data: settings, isLoading, isError, refetch } = useNotificationSettings();
  const { data: admins, isLoading: adminsLoading } = useUsers({ role: "admin", pageSize: 100 });
  const { data: staff, isLoading: staffLoading } = useUsers({ role: "staff", pageSize: 100 });

  const recipientOptions = useMemo(
    () => [...(admins?.data ?? []), ...(staff?.data ?? [])],
    [admins, staff],
  );

  if (isLoading || adminsLoading || staffLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError || !settings) {
    return <ErrorState message="Couldn't load notification settings." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">Notification Manager</h1>
          <p className="text-sm text-muted-foreground">
            Choose who gets notified — and how — for each rider action that needs review.
          </p>
        </div>
      </div>

      {recipientOptions.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          No admin or staff accounts found to notify yet.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {NOTIFICATION_TYPES.map((type) => {
          const setting = settings.find((s) => s.notification_type === type);
          if (!setting) return null;
          return (
            <NotificationTypeCard
              key={type}
              type={type}
              setting={setting}
              recipientOptions={recipientOptions}
            />
          );
        })}
      </div>
    </div>
  );
}

function NotificationTypeCard({
  type,
  setting,
  recipientOptions,
}: {
  type: NotificationType;
  setting: NotificationSetting;
  recipientOptions: Array<{ id: string; full_name: string; roles: string[] }>;
}) {
  const updateSetting = useUpdateNotificationSetting();
  const saved = useMemo(() => toPending(setting), [setting]);
  const [pending, setPending] = useState<PendingState>(saved);
  const [error, setError] = useState<string | null>(null);

  // Re-sync once the server round-trips a save, but never clobber an in-progress edit.
  useEffect(() => {
    setPending((prev) => (isDirty(prev, saved) && updateSetting.isPending ? prev : saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const dirty = isDirty(pending, saved);

  const toggleRecipient = (userId: string, checked: boolean) => {
    setError(null);
    setPending((prev) => ({
      ...prev,
      recipient_user_ids: checked
        ? Array.from(new Set([...prev.recipient_user_ids, userId]))
        : prev.recipient_user_ids.filter((id) => id !== userId),
    }));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm">{NOTIFICATION_TYPE_LABELS[type]}</CardTitle>
          <CardDescription>{pending.recipient_user_ids.length} recipient{pending.recipient_user_ids.length === 1 ? "" : "s"}</CardDescription>
        </div>
        {setting.enabled && <Badge variant="success">Enabled</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
          <Label className="cursor-pointer text-sm font-normal">Enable notification</Label>
          <Switch checked={pending.enabled} onCheckedChange={(v) => { setError(null); setPending((p) => ({ ...p, enabled: v })); }} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
          <Label className="cursor-pointer text-sm font-normal">Send email</Label>
          <Switch checked={pending.send_email} onCheckedChange={(v) => { setError(null); setPending((p) => ({ ...p, send_email: v })); }} />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
          <Label className="cursor-pointer text-sm font-normal">In-app notification</Label>
          <Switch checked={pending.send_in_app} onCheckedChange={(v) => { setError(null); setPending((p) => ({ ...p, send_in_app: v })); }} />
        </div>

        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">Recipients</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {recipientOptions.length === 0 && (
              <p className="px-1 py-1 text-xs text-muted-foreground">No accounts available.</p>
            )}
            {recipientOptions.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-secondary">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  checked={pending.recipient_user_ids.includes(user.id)}
                  onChange={(e) => toggleRecipient(user.id, e.target.checked)}
                />
                <span className="truncate">
                  {user.full_name}
                  {user.roles.includes("admin") && <span className="ml-1 text-xs text-muted-foreground">(Admin)</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={!dirty} onClick={() => setPending(saved)}>
            Discard
          </Button>
          <Button
            size="sm"
            disabled={!dirty || updateSetting.isPending}
            onClick={() => {
              updateSetting.mutate(
                { type, input: pending },
                { onError: (err) => setError(err instanceof Error ? err.message : "Could not save.") },
              );
            }}
          >
            {updateSetting.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
