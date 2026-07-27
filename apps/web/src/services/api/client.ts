import type { PaginatedResult } from "@/types";

/**
 * Thin mock "API" layer. Every function here returns a Promise with an
 * artificial delay so React Query loading/skeleton states behave the same
 * way they will once these are swapped for real fetch() calls against
 * VITE_API_BASE_URL (see apps/backend routes for the real shape to match).
 */
export function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
