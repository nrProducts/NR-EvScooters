import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

export interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface HolidayFilters {
  page?: number;
  pageSize?: number;
  upcoming?: boolean;
}

export interface CreateHolidayInput {
  name: string;
  holiday_date: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateHolidayInput {
  name?: string;
  holiday_date?: string;
  description?: string | null;
  is_active?: boolean;
}

/** GET /holidays — requireAction("holidays","view"). */
export async function fetchHolidays(filters: HolidayFilters = {}): Promise<PaginatedResult<Holiday>> {
  const { page = 1, pageSize = 20, upcoming } = filters;
  const res = await apiClient.get<BackendPaginated<Holiday>>("/holidays", { page, pageSize, upcoming });
  return toPaginatedResult(res);
}

/** POST /holidays — requireAction("holidays","manage"). 409 if a holiday already exists on that date. */
export async function createHoliday(input: CreateHolidayInput): Promise<Holiday> {
  return apiClient.post<Holiday>("/holidays", input);
}

/** PATCH /holidays/:id — requireAction("holidays","manage"). */
export async function updateHoliday(id: string, input: UpdateHolidayInput): Promise<Holiday> {
  return apiClient.patch<Holiday>(`/holidays/${id}`, input);
}

/** DELETE /holidays/:id — requireAction("holidays","manage"). */
export async function deleteHoliday(id: string): Promise<void> {
  await apiClient.delete<void>(`/holidays/${id}`);
}
