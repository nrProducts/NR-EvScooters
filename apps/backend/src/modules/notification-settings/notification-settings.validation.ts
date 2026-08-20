import { z } from "zod";

/**
 * The type code is free text, not an enum — `notification_types` is a
 * catalogue, so a new event type must not need a deploy. The service 404s on
 * a code the table does not have.
 */
export const notificationTypeParam = z.object({
    type: z.string().trim().min(1).max(60),
});

export const updateNotificationSettingBody = z.object({
    enabled: z.boolean(),
    send_email: z.boolean(),
    send_in_app: z.boolean(),
    recipient_user_ids: z.array(z.string().uuid()).max(50, "Too many recipients."),
});

export type NotificationTypeParam = z.infer<typeof notificationTypeParam>;
export type UpdateNotificationSettingBody = z.infer<typeof updateNotificationSettingBody>;
