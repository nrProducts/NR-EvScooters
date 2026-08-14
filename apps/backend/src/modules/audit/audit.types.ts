export interface AuditLogRow {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
    created_at: string;
    actor: { id: string; full_name: string } | null;
    target_user: { id: string; full_name: string } | null;
}

export interface ListAuditLogsFilters {
    page: number;
    pageSize: number;
    action?: string;
    entityType?: string;
}

// ---------------------------------------------------------------------------
// PII access log — reads, as opposed to audit_logs' writes and decisions.
// ---------------------------------------------------------------------------

export interface PiiAccessRow {
    id: string;
    resource: string;
    resource_id: string | null;
    fields: string[] | null;
    reason: string;
    context_ref: string | null;
    actor_roles: string[];
    ip: string | null;
    path: string | null;
    created_at: string;
    actor: { id: string; full_name: string } | null;
    target_user: { id: string; full_name: string } | null;
}

export interface ListPiiAccessFilters {
    page: number;
    pageSize: number;
    actorId?: string;
    targetUserId?: string;
    resource?: string;
    reason?: string;
    /** ISO date; entries strictly before this are excluded. */
    since?: string;
}
