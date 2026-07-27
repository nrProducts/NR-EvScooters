import { NotificationChannel, NotificationStatus } from "../../types";

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
}

export interface NotifyInput {
    template: string;
    title: string;
    body: string;
    screen?: string;
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
