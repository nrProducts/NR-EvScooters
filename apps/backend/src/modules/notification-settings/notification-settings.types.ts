import { NotificationType } from "../../types";

export interface NotificationRecipient {
    user_id: string;
    full_name: string;
}

export interface NotificationSettingRow {
    id: string;
    notification_type: NotificationType;
    enabled: boolean;
    send_email: boolean;
    send_in_app: boolean;
    recipients: NotificationRecipient[];
    updated_at: string | null;
}

export interface UpdateNotificationSettingInput {
    enabled: boolean;
    send_email: boolean;
    send_in_app: boolean;
    recipient_user_ids: string[];
}

/** A configured recipient still eligible to be notified — filtered to active, non-deleted accounts. See getRecipients(). */
export interface EligibleRecipient {
    id: string;
    full_name: string;
    email: string | null;
}

/**
 * What notify() needs to act on one event type: whether to deliver at all,
 * through which channel(s), and to whom. `recipients` is already [] when
 * `enabled` is false or both send flags are false — callers never need to
 * separately check `enabled`.
 */
export interface RecipientResolution {
    sendEmail: boolean;
    sendInApp: boolean;
    recipients: EligibleRecipient[];
}
