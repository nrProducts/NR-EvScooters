import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { BroadcastResult, NotificationDeliveryStatus, NotificationLogEntry, PaginatedResult } from "@/types";

export interface NotificationFilters {
  status?: NotificationDeliveryStatus | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "created_at";
  sortDir?: "asc" | "desc";
}

/** GET /notifications — requireStaff. See apps/backend/src/modules/notifications/notifications.routes.ts */
export async function fetchNotifications(filters: NotificationFilters = {}): Promise<PaginatedResult<NotificationLogEntry>> {
  const { status, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<NotificationLogEntry>>("/notifications", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
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
