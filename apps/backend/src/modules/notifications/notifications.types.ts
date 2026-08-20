import {
    DeliveryStatus, EmittedNotificationCode, NotificationChannel, NotificationTypeCode,
} from "../../types";

/**
 * `notifications_log` — one row per (recipient, channel) — became three tables:
 *
 *   `notification_events`     what happened, once, regardless of who hears about it
 *   `notification_messages`   one per recipient: the title/body they see, and read_at
 *   `notification_deliveries` one per channel attempted, with its own status
 *
 * The old single row conflated all three, which is why "the same event" had
 * to be re-inserted per recipient per channel, and why a push failing marked
 * the whole notification failed even though the email had gone out.
 *
 * The wire shapes below are unchanged — the flattening happens in the service.
 */

export interface NotificationPayload {
    title: string;
    body: string;
    screen?: string;
}

export interface NotificationRow {
    /** `notification_messages.id`. */
    id: string;
    user_id: string;
    /**
     * The channel this row represents.
     *
     * A message can now have several deliveries; this reports the one the
     * caller asked about, or the push delivery by default — which is what the
     * old per-channel row meant.
     */
    channel: NotificationChannel;
    /** `notification_type_code`. Was a free-text `template`. */
    template: string;
    payload: NotificationPayload | null;
    /** The delivery's status, not the message's. */
    status: DeliveryStatus;
    sent_at: string | null;
    read_at: string | null;
    created_at: string;
    /** `notification_events.notification_type_code`. */
    notification_type: NotificationTypeCode | null;
    /** `notification_events.subject_type` / `subject_id`. */
    reference_type: string | null;
    reference_id: string | null;
    /**
     * The old row carried three denormalised foreign keys so the console could
     * filter without a join. They are `notification_events.payload` now — a
     * jsonb bag, because which ids matter depends entirely on the event.
     */
    booking_id: string | null;
    vehicle_id: string | null;
    rider_id: string | null;
}

export interface NotifyInput {
    /**
     * The `notification_types.code` this notification carries. Narrowed from
     * `string`: it lands in a column with a RESTRICT foreign key, and as a
     * bare string it let 20 unseeded codes ship — every one of them failing
     * its insert at runtime and being swallowed. See EmittedNotificationCode.
     */
    template: EmittedNotificationCode;
    title: string;
    body: string;
    screen?: string;
    /**
     * Overrides `template` as the code written to `notification_type_code`.
     * Nothing passes it today — `template` already IS the code — but the
     * fallback is kept so the two can diverge if a caller ever needs the
     * push payload's template to differ from the catalogue code.
     */
    notification_type?: EmittedNotificationCode;
    reference_type?: string;
    reference_id?: string;
    booking_id?: string;
    vehicle_id?: string;
    rider_id?: string;
}

export interface ListNotificationsFilters {
    page: number;
    pageSize: number;
}

// ---------------------------------------------------------------------------
// Admin — broadcast + fleet-wide notification log
// ---------------------------------------------------------------------------

export interface AdminNotificationRow extends NotificationRow {
    rider: { id: string; full_name: string } | null;
}

export interface ListAdminNotificationsFilters {
    page: number;
    pageSize: number;
    status?: DeliveryStatus;
    userId?: string;
    sortBy: "created_at";
    sortDir: "asc" | "desc";
}

export interface BroadcastInput {
    title: string;
    body: string;
    screen?: string;
    /** Omit to send to every active rider. */
    user_ids?: string[];
}

export interface BroadcastResult {
    template: string;
    targeted: number;
    sent: number;
    failed: number;
}
