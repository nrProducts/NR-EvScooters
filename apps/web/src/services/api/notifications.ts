import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { BroadcastResult, MyNotification, NotificationDeliveryStatus, NotificationLogEntry, PaginatedResult } from "@/types";

export interface NotificationFilters {
  status?: NotificationDeliveryStatus | "all";
  /** `notification_type_code` — e.g. "admin_broadcast" to scope the fleet log to broadcasts only. */
  notificationType?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "created_at";
  sortDir?: "asc" | "desc";
}

/** GET /notifications — requireStaff. Fleet-wide log. See apps/backend/src/modules/notifications/notifications.routes.ts */
export async function fetchNotifications(filters: NotificationFilters = {}): Promise<PaginatedResult<NotificationLogEntry>> {
  const { status, notificationType, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<NotificationLogEntry>>("/notifications", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    notificationType,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

export interface BroadcastInput {
  title: string;
  body: string;
  screen?: string;
  /** Omit to send to every active rider. */
  user_ids?: string[];
}

/**
 * POST /notifications/broadcast — requireStaff. Push only for now — SMS/email
 * channels exist in the schema but have no delivery path wired up yet.
 */
export async function broadcastNotification(input: BroadcastInput): Promise<BroadcastResult> {
  return apiClient.post<BroadcastResult>("/notifications/broadcast", input);
}

// ---------------------------------------------------------------------------
// Personal inbox (rider, staff, or admin) — used by the header notification
// bell. Distinct from the fleet-wide admin log above.
// ---------------------------------------------------------------------------

export interface MyNotificationFilters {
  page?: number;
  pageSize?: number;
}

/** GET /users/me/notifications — the caller's own inbox. */
export async function fetchMyNotifications(filters: MyNotificationFilters = {}): Promise<PaginatedResult<MyNotification>> {
  const { page = 1, pageSize = 10 } = filters;
  const res = await apiClient.get<BackendPaginated<MyNotification>>("/users/me/notifications", { page, pageSize });
  return toPaginatedResult(res);
}

/** GET /users/me/notifications/unread-count */
export async function fetchUnreadCount(): Promise<number> {
  const res = await apiClient.get<{ count: number }>("/users/me/notifications/unread-count");
  return res.count;
}

/** PATCH /users/me/notifications/:id/read */
export async function markNotificationRead(id: string): Promise<MyNotification> {
  return apiClient.patch<MyNotification>(`/users/me/notifications/${id}/read`);
}

/** POST /users/me/notifications/read-all */
export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post<void>("/users/me/notifications/read-all");
}
