import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

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

export const emailLogQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    notificationType: z.string().trim().min(1).max(60).optional(),
    status: z.enum(["pending", "sent", "failed"]).optional(),
});

export type NotificationTypeParam = z.infer<typeof notificationTypeParam>;
export type UpdateNotificationSettingBody = z.infer<typeof updateNotificationSettingBody>;
export type EmailLogQuery = z.infer<typeof emailLogQuery>;
