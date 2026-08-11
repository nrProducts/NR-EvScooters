export type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportPriority = "low" | "medium" | "high" | "urgent";

export interface CreateSupportInput {
    subject: string;
    description: string;
}

export interface SupportView {
    id: string;
    subject: string;
    description: string;
    status: SupportStatus;
    priority: SupportPriority;
    resolved_at: string | null;
    created_at: string;
}

export interface SupportQueueView extends SupportView {
    rider: { id: string; full_name: string; phone: string | null };
    assigned_to: string | null;
    /** Auto-attached at creation from the rider's active rental, if any — so staff know which ride this is about. */
    rental_id: string | null;
    vehicle_id: string | null;
}

export interface SupportHistoryFilters {
    page: number;
    pageSize: number;
}

export interface SupportQueueFilters {
    page: number;
    pageSize: number;
    status?: SupportStatus;
    sortBy: "created_at";
    sortDir: "asc" | "desc";
}

export interface UpdateSupportInput {
    status?: SupportStatus;
    priority?: SupportPriority;
    assigned_to?: string;
}
