import type { RequestClient } from "../../common/requestLog";

export interface ListErrorLogsFilters {
    page: number;
    pageSize: number;
    client?: RequestClient;
    /** Matches method, path, error_code or message, case-insensitively. */
    search?: string;
    /** Only rows with status_code >= this. Defaults to 400 server-side if omitted — see errorLogs.service.ts. */
    minStatus?: number;
}

export interface ErrorLogRow {
    id: string;
    occurred_at: string;
    client: RequestClient;
    method: string;
    path: string;
    status_code: number;
    error_code: string | null;
    message: string | null;
    stack: string | null;
    user: { id: string; full_name: string } | null;
}
