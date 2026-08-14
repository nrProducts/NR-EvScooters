export type DpRequestType =
    | "access_export"
    | "correction"
    | "erasure"
    | "grievance"
    | "nominee_update";

export type DpRequestStatus =
    | "open"
    | "in_progress"
    | "awaiting_principal"
    | "completed"
    | "rejected"
    | "withdrawn";

export type DpRequestChannel = "app" | "email" | "phone" | "walk_in";

/** What the rider sees. Deliberately excludes internal notes and assignee. */
export interface PrivacyRequestView {
    id: string;
    reference: string;
    type: DpRequestType;
    status: DpRequestStatus;
    details: string | null;
    requested_changes: Record<string, unknown> | null;
    sla_due_at: string;
    grace_ends_at: string | null;
    /** Set only once the request is closed, and written for the rider to read. */
    resolution_notes: string | null;
    rejection_reason: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string | null;
}

/** The staff view: everything above plus the workflow fields. */
export interface PrivacyRequestAdminView extends PrivacyRequestView {
    channel: DpRequestChannel;
    ticket_ref: string | null;
    export_object_path: string | null;
    rider: { id: string; full_name: string; phone: string | null; email: string | null } | null;
    assigned_to: { id: string; full_name: string } | null;
    /** Convenience for the queue: past due and not yet closed. */
    is_overdue: boolean;
}

export interface ListPrivacyRequestsFilters {
    page: number;
    pageSize: number;
    type?: DpRequestType;
    status?: DpRequestStatus;
    /** Only requests past their SLA and not closed. */
    overdueOnly?: boolean;
    assignedTo?: string;
}

export interface NomineeView {
    full_name: string | null;
    relationship: string | null;
    phone: string | null;
    email: string | null;
    updated_at: string | null;
}
