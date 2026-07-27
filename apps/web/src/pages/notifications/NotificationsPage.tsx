import { useState } from "react";
import { Plus, Bell, MessageSquare, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingSkeletonRows } from "@/components/common/LoadingSkeletonRows";
import { useNotifications, useCreateNotification } from "@/hooks/useNotifications";
import { formatDateTime } from "@/lib/utils";
import type { NotificationItem } from "@/types";

const CHANNEL_ICON: Record<NotificationItem["channel"], typeof Bell> = {
  push: Bell,
  sms: MessageSquare,
  email: Mail,
};

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const createNotification = useCreateNotification();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    message: "",
    channel: "push" as NotificationItem["channel"],
    audience: "All riders",
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notification Center</h1>
          <p className="text-sm text-muted-foreground">Push, SMS, email and announcements</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New notification
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeletonRows rows={4} cols={3} />
          ) : !notifications || notifications.length === 0 ? (
            <EmptyState title="No notifications yet" />
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = CHANNEL_ICON[n.channel];
                return (
                  <div key={n.id} className="flex items-start gap-3 p-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{n.title}</p>
                        <StatusBadge status={n.status} />
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n.audience} ·{" "}
                        {n.sentOn ? `Sent ${formatDateTime(n.sentOn)}` : n.scheduledFor ? `Scheduled ${formatDateTime(n.scheduledFor)}` : "Draft"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compose notification</DialogTitle>
            <DialogDescription>Send an announcement to riders across channels.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v as NotificationItem["channel"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select value={form.audience} onValueChange={(v) => setForm((f) => ({ ...f, audience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All riders">All riders</SelectItem>
                    <SelectItem value="Pending KYC riders">Pending KYC riders</SelectItem>
                    <SelectItem value="Active bookings">Active bookings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.title || !form.message || createNotification.isPending}
              onClick={() => createNotification.mutate(form, { onSuccess: () => setOpen(false) })}
            >
              Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
