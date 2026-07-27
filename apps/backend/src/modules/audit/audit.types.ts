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
