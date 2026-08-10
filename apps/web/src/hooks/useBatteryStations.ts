import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/batteryStations";
import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";
import type {
  AdminStationFilters, CreateStationPayload, UpdateStationPayload,
} from "@/types/batteryStation";

const STATIONS_KEY = ["battery-stations"] as const;

/** Both the grid and the summary cards must move together after any write. */
function invalidateStations(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: STATIONS_KEY });
}

const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export function useAdminStations(filters: AdminStationFilters) {
  return useQuery({
    queryKey: [...STATIONS_KEY, "admin", filters],
    queryFn: () => api.getAdminStations(filters),
  });
}

export function useStationSummary() {
  return useQuery({
    queryKey: [...STATIONS_KEY, "summary"],
    queryFn: () => api.getStationSummary(),
  });
}

export function useCreateStation() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (payload: CreateStationPayload) => api.createStation(payload),
    onSuccess: (station) => {
      invalidateStations(qc);
      push({ tone: "success", title: "Station added", message: `${station.name} is now on the map.` });
    },
    // The form also renders the error inline; the toast is for the case where
    // the dialog has already scrolled the message out of view.
    onError: (error) => push({ tone: "error", title: "Could not add station", message: errorMessage(error) }),
  });
}

export function useUpdateStation() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateStationPayload }) => api.updateStation(id, payload),
    onSuccess: (station) => {
      invalidateStations(qc);
      push({ tone: "success", title: "Station updated", message: `${station.name} has been saved.` });
    },
    onError: (error) => push({ tone: "error", title: "Could not save station", message: errorMessage(error) }),
  });
}

export function useUpdateStationVisibility() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) => api.updateStationVisibility(id, isVisible),
    onSuccess: (station) => {
      invalidateStations(qc);
      push({
        tone: "success",
        title: station.isVisibleOnMobile ? "Station shown" : "Station hidden",
        message: station.isVisibleOnMobile
          ? `${station.name} is visible on the rider map.`
          : `${station.name} no longer appears on the rider map.`,
      });
    },
    onError: (error) => push({ tone: "error", title: "Could not change visibility", message: errorMessage(error) }),
  });
}

export function useDeleteStation() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => api.deleteStation(id),
    onSuccess: (_result, { name }) => {
      invalidateStations(qc);
      push({ tone: "success", title: "Station deleted", message: `${name} has been removed from the map.` });
    },
    onError: (error) => push({ tone: "error", title: "Could not delete station", message: errorMessage(error) }),
  });
}
