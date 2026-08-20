import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/attendance";

export function useMyAttendanceToday(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["attendance", "me", "today"],
    queryFn: api.fetchMyAttendanceToday,
    enabled: options?.enabled ?? true,
  });
}

export function useMyAttendanceHistory(filters: api.AttendanceHistoryFilters) {
  return useQuery({
    queryKey: ["attendance", "me", "history", filters],
    queryFn: () => api.fetchMyAttendanceHistory(filters),
  });
}

export function useTodayRoster() {
  return useQuery({ queryKey: ["attendance", "roster", "today"], queryFn: api.fetchTodayRoster });
}

export function useAttendanceLog(filters: api.AttendanceLogFilters) {
  return useQuery({ queryKey: ["attendance", "log", filters], queryFn: () => api.fetchAttendanceLog(filters) });
}

function invalidateAttendance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["attendance"] });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.checkIn, onSuccess: () => invalidateAttendance(qc) });
}

export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.checkOut, onSuccess: () => invalidateAttendance(qc) });
}
