import { supabaseAdmin } from "../../config/supabase";
import { paginate, toRange } from "../../common/pagination";
import { Paginated } from "../../types";
import { AuditLogRow, ListAuditLogsFilters } from "./audit.types";

const AUDIT_COLUMNS = `
    id, action, entity_type, entity_id, before_data, after_data, created_at,
    actor:users!audit_logs_actor_id_fkey(id, full_name),
    target_user:users!audit_logs_target_user_id_fkey(id, full_name)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawAuditRow {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before_data: Record<string, unknown> | null;
    after_data: Record<string, unknown> | null;
    created_at: string;
    actor: unknown;
    target_user: unknown;
}

/** Read-only trail of every tracked action — audit_logs is append-only (see trg_audit_logs_immutable). */
export async function listAuditLogs(filters: ListAuditLogsFilters): Promise<Paginated<AuditLogRow>> {
    let query = supabaseAdmin.from("audit_logs").select(AUDIT_COLUMNS, { count: "exact" });

    if (filters.action) query = query.eq("action", filters.action);
    if (filters.entityType) query = query.eq("entity_type", filters.entityType);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawAuditRow[];
    return paginate(
        rows.map((row) => ({
            id: row.id,
            action: row.action,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            before_data: row.before_data,
            after_data: row.after_data,
            created_at: row.created_at,
            actor: unwrap(row.actor),
            target_user: unwrap(row.target_user),
        })),
        count ?? 0,
        filters,
    );
}
