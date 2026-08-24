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
import { usePageSubtitle } from "@/hooks/usePageSubtitle";
import { cn } from "@/lib/utils";
import { toastSuccess, toastError } from "@/lib/toastHelpers";
import type { NotificationSetting } from "@/types";

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

  usePageSubtitle("Choose who gets notified — and how — for each rider action that needs review.");

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
    <div className="space-y-3 animate-fade-in">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
      </Button>

      {recipientOptions.length === 0 && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          No admin or staff accounts found to notify yet.
        </div>
      )}

      {/*
        Driven by what the server actually has, not by a hard-coded list.
        `notification_types` is a table; a code added by migration appears
        here without a front-end change, and — more to the point — a code the
        console had never heard of is no longer silently unconfigurable.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {settings.map((setting) => (
          <NotificationTypeCard
            key={setting.notification_type}
            setting={setting}
            recipientOptions={recipientOptions}
          />
        ))}
      </div>
    </div>
  );
}

function NotificationTypeCard({
  setting,
  recipientOptions,
}: {
  setting: NotificationSetting;
  recipientOptions: Array<{ id: string; full_name: string; role: string }>;
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
    <Card className={cn(dirty && "border-primary/40")}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-3.5 pb-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{setting.label}</CardTitle>
          <CardDescription>{pending.recipient_user_ids.length} recipient{pending.recipient_user_ids.length === 1 ? "" : "s"}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {setting.requires_action && <Badge variant="outline">Needs action</Badge>}
          {setting.enabled && <Badge variant="success">Enabled</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 p-3.5 pt-0">
        <div className="divide-y divide-border rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <Label className="cursor-pointer text-xs font-normal">Enable notification</Label>
            <Switch checked={pending.enabled} onCheckedChange={(v) => { setError(null); setPending((p) => ({ ...p, enabled: v })); }} />
          </div>
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <Label className="cursor-pointer text-xs font-normal">Send email</Label>
            <Switch checked={pending.send_email} onCheckedChange={(v) => { setError(null); setPending((p) => ({ ...p, send_email: v })); }} />
          </div>
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <Label className="cursor-pointer text-xs font-normal">In-app notification</Label>
            <Switch checked={pending.send_in_app} onCheckedChange={(v) => { setError(null); setPending((p) => ({ ...p, send_in_app: v })); }} />
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Recipients</p>
          <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
            {recipientOptions.length === 0 && (
              <p className="px-1 py-1 text-xs text-muted-foreground">No accounts available.</p>
            )}
            {recipientOptions.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-secondary">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                  checked={pending.recipient_user_ids.includes(user.id)}
                  onChange={(e) => toggleRecipient(user.id, e.target.checked)}
                />
                <span className="truncate">
                  {user.full_name}
                  {user.role === "admin" && <span className="ml-1 text-muted-foreground">(Admin)</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Save/Discard only take up space once there's actually something to save — with
            one card per notification type, showing a permanently-visible (if disabled) button
            pair on every untouched card is what made this screen feel like "lots of save". */}
        {dirty && (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPending(saved)}>
                Discard
              </Button>
              <Button
                size="sm"
                className="h-7 px-2.5 text-xs"
                disabled={updateSetting.isPending}
                onClick={() => {
                  updateSetting.mutate(
                    { type: setting.notification_type, input: pending },
                    {
                      onSuccess: () => toastSuccess("Notification settings saved"),
                      onError: (err) => {
                        setError(err instanceof Error ? err.message : "Could not save.");
                        toastError(err, "Could not save notification settings");
                      },
                    },
                  );
                }}
              >
                {updateSetting.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
