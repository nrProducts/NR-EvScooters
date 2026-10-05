import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/holidays";
import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";

const HOLIDAYS_KEY = ["holidays"] as const;

function invalidateHolidays(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: HOLIDAYS_KEY });
}

const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export function useHolidays(filters: api.HolidayFilters) {
  return useQuery({ queryKey: [...HOLIDAYS_KEY, filters], queryFn: () => api.fetchHolidays(filters) });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (input: api.CreateHolidayInput) => api.createHoliday(input),
    onSuccess: (holiday) => {
      invalidateHolidays(qc);
      push({ tone: "success", title: "Holiday added", message: `${holiday.name} has been added to the calendar.` });
    },
    onError: (error) => push({ tone: "error", title: "Could not add holiday", message: errorMessage(error) }),
  });
}

export function useUpdateHoliday() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.UpdateHolidayInput }) => api.updateHoliday(id, input),
    onSuccess: (holiday) => {
      invalidateHolidays(qc);
      push({ tone: "success", title: "Holiday updated", message: `${holiday.name} has been saved.` });
    },
    onError: (error) => push({ tone: "error", title: "Could not save holiday", message: errorMessage(error) }),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => api.deleteHoliday(id),
    onSuccess: (_result, { name }) => {
      invalidateHolidays(qc);
      push({ tone: "success", title: "Holiday deleted", message: `${name} has been removed from the calendar.` });
    },
    onError: (error) => push({ tone: "error", title: "Could not delete holiday", message: errorMessage(error) }),
  });
}
