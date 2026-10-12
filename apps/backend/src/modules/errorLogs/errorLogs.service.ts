import { supabaseAdmin } from "../../config/supabase";
import { paginate, toRange } from "../../common/pagination";
import type { Paginated } from "../../types";
import type { RequestClient } from "../../common/requestLog";
import type { ErrorLogRow, ListErrorLogsFilters } from "./errorLogs.types";

const COLUMNS = `
    id, occurred_at, client, method, path, status_code, error_code, message, stack,
    user:users(id, full_name)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawErrorLogRow {
    id: string;
    occurred_at: string;
    client: string;
    method: string;
    path: string;
    status_code: number;
    error_code: string | null;
    message: string | null;
    stack: string | null;
    user: unknown;
}

/**
 * Read side of request_error_logs — every failed API call across all three
 * clients (mobile, web, website), newest first. Written by errorHandler
 * (apps/backend/src/middleware/error.middleware.ts), purged after 10 days by
 * a daily cron (see the migration) — this is an operational debugging aid,
 * not a compliance record, so there is no reason to keep it longer or make
 * it append-only the way audit_logs is.
 */
export async function listErrorLogs(filters: ListErrorLogsFilters): Promise<Paginated<ErrorLogRow>> {
    let query = supabaseAdmin.from("request_error_logs").select(COLUMNS, { count: "exact" });

    if (filters.client) query = query.eq("client", filters.client);
    // 4xx/5xx only by default — a caller who wants a raw status floor below
    // that can still pass one explicitly, but "every error" is what this
    // screen is for, and nothing writes a row here below 400 anyway (see
    // errorHandler — only AppError/multer/unhandled paths call logRequestError).
    query = query.gte("status_code", filters.minStatus ?? 400);

    const term = filters.search?.trim();
    if (term) {
        query = query.or([
            `path.ilike.%${term}%`,
            `method.ilike.%${term}%`,
            `error_code.ilike.%${term}%`,
            `message.ilike.%${term}%`,
        ].join(","));
    }

    const [from, to] = toRange(filters);
    query = query.order("occurred_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawErrorLogRow[];
    return paginate(
        rows.map((row) => ({
            id: row.id,
            occurred_at: row.occurred_at,
            client: row.client as RequestClient,
            method: row.method,
            path: row.path,
            status_code: row.status_code,
            error_code: row.error_code,
            message: row.message,
            stack: row.stack,
            user: unwrap(row.user),
        })),
        count ?? 0,
        filters,
    );
}
