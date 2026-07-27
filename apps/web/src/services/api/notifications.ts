import { MOCK_NOTIFICATIONS } from "@/services/mockData";
import type { NotificationItem } from "@/types";
import { delay } from "./client";

let notifications = [...MOCK_NOTIFICATIONS];

export async function fetchNotifications() {
  return delay(notifications);
}

export async function createNotification(input: Partial<NotificationItem>) {
  const item: NotificationItem = {
    id: `ntf_${notifications.length + 1}_${Date.now()}`,
    title: input.title ?? "Untitled",
    message: input.message ?? "",
    channel: input.channel ?? "push",
    audience: input.audience ?? "All riders",
    scheduledFor: input.scheduledFor,
    status: input.scheduledFor ? "scheduled" : "sent",
    sentOn: input.scheduledFor ? undefined : new Date().toISOString(),
  };
  notifications = [item, ...notifications];
  return delay(item);
}
