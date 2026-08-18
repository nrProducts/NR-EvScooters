import { z } from "zod";
import { NOTIFICATION_TYPES } from "../../types";

export const notificationTypeParam = z.object({
    type: z.enum(NOTIFICATION_TYPES as [string, ...string[]]),
});

export const updateNotificationSettingBody = z.object({
    enabled: z.boolean(),
    send_email: z.boolean(),
    send_in_app: z.boolean(),
    recipient_user_ids: z.array(z.string().uuid()).max(50, "Too many recipients."),
});

export type NotificationTypeParam = z.infer<typeof notificationTypeParam>;
export type UpdateNotificationSettingBody = z.infer<typeof updateNotificationSettingBody>;
