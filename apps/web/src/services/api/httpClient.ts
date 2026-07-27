import { supabase } from "@/lib/supabaseClient";
import type { PaginatedResult } from "@/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

/** Backend pagination envelope — see apps/backend/src/common/pagination.ts. */
export interface BackendPaginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/** Adapts the backend's { data, pagination } envelope to the shape every
 * existing table/Pagination component already expects. */
export function toPaginatedResult<T>(res: BackendPaginated<T>): PaginatedResult<T> {
  return { data: res.data, total: res.pagination.total, page: res.pagination.page, pageSize: res.pagination.pageSize };
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "all") continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {},
): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${BASE_URL}${path}${buildQuery(options.query)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // empty/non-JSON body — fine for e.g. some 204s that slip through
  }

  if (!res.ok) {
    const body = payload as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.message ?? "Something went wrong. Please try again.",
      res.status,
      body?.error?.code,
      body?.error?.fields,
    );
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
    request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
