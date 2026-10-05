import { supabaseAdmin } from "../../config/supabase";
import { paginate, toRange } from "../../common/pagination";
import { Paginated } from "../../types";
import {
    AuditLogRow, ListAuditLogsFilters, ListPiiAccessFilters, PiiAccessRow,
} from "./audit.types";

const AUDIT_COLUMNS = `
    id, action, entity_type, entity_id, before_data, after_data, created_at,
    actor:users!audit_logs_actor_user_id_fkey(id, full_name),
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

/**
 * NOTE ON THE COLUMN NAMES.
 *
 * These were `actor_roles`, `ip` and `path` — the OLD schema's names. The
 * writer (common/piiAccess.ts) was migrated and inserts
 * `actor_role_snapshot` / `ip_address` / `request_path`; this reader was not,
 * so every GET /pii-access returned a PostgREST 400 ("column
 * pii_access_log.actor_roles does not exist") and the PII Access Log page was
 * dead.
 *
 * It survived the migration because a select STRING is only type-checked when
 * supabase-js can parse it, and it gives up on the `alias:table!fk_name(...)`
 * embed hints used below — so the whole string degrades to an unchecked
 * `string` and tsc has nothing to complain about. Two of these constants were
 * wrong for that reason; see the sibling note in invoices.service.ts.
 *
 * `actor_role_snapshot` is also SINGULAR now: one role per user, captured at
 * access time. It is aliased back to `actor_role` rather than `actor_roles`,
 * because reporting one value through a plural array field was what let the
 * console print "admin" as if it were a list.
 */
const PII_ACCESS_COLUMNS = `
    id, resource, resource_id, fields, reason, context_ref,
    actor_role_snapshot, ip_address, request_path, created_at,
    actor:users!pii_access_log_actor_user_id_fkey(id, full_name),
    target_user:users!pii_access_log_target_user_id_fkey(id, full_name)
`;

interface RawPiiAccessRow
    extends Omit<PiiAccessRow, "actor" | "target_user" | "actor_role" | "ip_address" | "request_path"> {
    actor_role_snapshot: PiiAccessRow["actor_role"];
    ip_address: string | null;
    request_path: string | null;
    actor: unknown;
    target_user: unknown;
}

/**
 * Who READ a rider's personal data. Append-only (trg_pii_access_append_only),
 * so this is the whole record and not a view over one.
 *
 * Kept in the audit module rather than a module of its own because it is the
 * same shape of question — "show me what happened" — served by the same admin
 * screens, and a third table with two rows of query code did not justify one.
 */
export async function listPiiAccess(
    filters: ListPiiAccessFilters,
): Promise<Paginated<PiiAccessRow>> {
    let query = supabaseAdmin.from("pii_access_log").select(PII_ACCESS_COLUMNS, { count: "exact" });

    if (filters.actorId) query = query.eq("actor_user_id", filters.actorId);
    if (filters.targetUserId) query = query.eq("target_user_id", filters.targetUserId);
    if (filters.resource) query = query.eq("resource", filters.resource);
    if (filters.reason) query = query.eq("reason", filters.reason as never);
    if (filters.since) query = query.gte("created_at", filters.since);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawPiiAccessRow[];
    return paginate(
        rows.map((row) => ({
            id: row.id,
            resource: row.resource,
            resource_id: row.resource_id,
            fields: row.fields,
            reason: row.reason,
            context_ref: row.context_ref,
            actor_role: row.actor_role_snapshot,
            ip_address: row.ip_address,
            request_path: row.request_path,
            created_at: row.created_at,
            actor: unwrap(row.actor),
            target_user: unwrap(row.target_user),
        })),
        count ?? 0,
        filters,
    );
}
