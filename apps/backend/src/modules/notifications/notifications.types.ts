import { NotificationChannel, NotificationStatus, NotificationType } from "../../types";

export interface NotificationPayload {
    title: string;
    body: string;
    screen?: string;
}

export interface NotificationRow {
    id: string;
    user_id: string;
    channel: NotificationChannel;
    template: string;
    payload: NotificationPayload | null;
    status: NotificationStatus;
    sent_at: string | null;
    read_at: string | null;
    created_at: string;
    /** Admin/staff notification reference columns — null on older/rider-only rows. See notify.service.ts. */
    notification_type: NotificationType | null;
    reference_type: string | null;
    reference_id: string | null;
    booking_id: string | null;
    vehicle_id: string | null;
    rider_id: string | null;
}

export interface NotifyInput {
    template: string;
    title: string;
    body: string;
    screen?: string;
    /** Set by notify.service.ts's notify() for admin/staff-scoped rows; left undefined by the ~9 existing rider-facing notifyUser() call sites. */
    notification_type?: NotificationType;
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
    status?: NotificationStatus;
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
