import { apiClient } from "./httpClient";
import type { NotificationSetting, NotificationType } from "@/types";

/** GET /notification-settings — requireAdmin. All 7 event types with current config + recipients. */
export async function fetchNotificationSettings(): Promise<NotificationSetting[]> {
  return apiClient.get<NotificationSetting[]>("/notification-settings");
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
