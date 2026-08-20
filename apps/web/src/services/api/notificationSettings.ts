import { apiClient } from "./httpClient";
import type { NotificationSetting, NotificationType, NotificationTypeSummary } from "@/types";

/**
 * GET /notification-settings — requireAdmin. Every event type with current
 * config AND its subscriber list, for the Notification Manager screen.
 */
export async function fetchNotificationSettings(): Promise<NotificationSetting[]> {
  return apiClient.get<NotificationSetting[]>("/notification-settings");
}

/**
 * GET /notification-settings/types — requireStaff. The catalogue WITHOUT
 * subscriber lists.
 *
 * Separate from the call above because the realtime layer runs for staff too,
 * and it only needs to know whether an incoming notification is a task
 * (`requires_action`) and where acting on it goes (`action_path`). Asking the
 * admin-only endpoint for that returned 403 to every staff session, which
 * silently turned every approval popup into a bell tick.
 */
export async function fetchNotificationTypeSummaries(): Promise<NotificationTypeSummary[]> {
  return apiClient.get<NotificationTypeSummary[]>("/notification-settings/types");
}

export interface UpdateNotificationSettingInput {
  enabled: boolean;
  send_email: boolean;
  send_in_app: boolean;
  recipient_user_ids: string[];
}

/** PUT /notification-settings/:type — requireAdmin. Replaces one type's config + recipient list wholesale. */
export async function updateNotificationSetting(
  type: NotificationType,
  input: UpdateNotificationSettingInput,
): Promise<NotificationSetting> {
  return apiClient.put<NotificationSetting>(`/notification-settings/${type}`, input);
}
