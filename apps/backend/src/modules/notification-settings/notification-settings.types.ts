import { NotificationTypeCode } from "../../types";

export interface NotificationRecipient {
    user_id: string;
    full_name: string;
}

export interface NotificationSettingRow {
    /** The type's `code` — there is no surrogate key on `notification_types`. */
    id: string;
    notification_type: NotificationTypeCode;
    /** Human-readable name, from the catalogue rather than the front end. */
    label: string;
    /** `is_enabled`. */
    enabled: boolean;
    send_email: boolean;
    send_in_app: boolean;
    /**
     * Whether this notification is a TASK rather than news.
     *
     * New. The console decided this with a hard-coded `APPROVAL_TEMPLATES`
     * map, which meant adding an approval-shaped notification required a
     * front-end change; it is catalogue data now.
     */
    requires_action: boolean;
    /** Where acting on it takes you, e.g. `/kyc`. */
    action_path: string | null;
    recipients: NotificationRecipient[];
    updated_at: string | null;
}

export interface UpdateNotificationSettingInput {
    enabled: boolean;
    send_email: boolean;
    send_in_app: boolean;
    recipient_user_ids: string[];
}

/** A configured recipient still eligible to be notified — active, non-deleted. */
export interface EligibleRecipient {
    id: string;
    full_name: string;
    email: string | null;
}

/**
 * What notify() needs to act on one event type. `recipients` is already []
 * when the type is disabled or both send flags are false, so callers never
 * need to separately check `enabled`.
 */
export interface RecipientResolution {
    sendEmail: boolean;
    sendInApp: boolean;
    recipients: EligibleRecipient[];
}

/**
 * The catalogue without its subscriber lists — what a non-admin surface needs
 * to interpret a notification it just received.
 *
 * Split out because `NotificationSettingRow` carries `recipients`, i.e. which
 * named staff are notified for which event, and the console's realtime layer
 * has no business with that. The approval popup only ever reads `label`,
 * `requires_action` and `action_path`.
 */
export interface NotificationTypeSummary {
    notification_type: NotificationTypeCode;
    label: string;
    requires_action: boolean;
    action_path: string | null;
}
