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
