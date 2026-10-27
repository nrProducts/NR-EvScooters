import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/telematics";

/**
 * The scooter's latest reading. Reads OUR database (the backend never calls
 * Intellicar per request), so refreshing every minute costs nothing against
 * the platform's rate limit — the sync job refreshes the data every 5 minutes.
 */
export function useVehicleTelemetry(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle-telemetry", vehicleId],
    queryFn: () => api.fetchVehicleTelemetry(vehicleId!),
    enabled: !!vehicleId,
    refetchInterval: 60_000,
  });
}

/** Every scooter's latest reading — one call for the Live Map, the list columns and the dashboard card. */
export function useFleetTelemetry() {
  return useQuery({
    queryKey: ["fleet-telemetry"],
    queryFn: api.fetchFleetTelemetry,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Distance covered in a rental. Cached by the backend, so this is one cheap call per page view. */
export function useRentalDistance(rentalId: string | undefined) {
  return useQuery({
    queryKey: ["rental-distance", rentalId],
    queryFn: () => api.fetchRentalDistance(rentalId!),
    enabled: !!rentalId,
    staleTime: 5 * 60_000,
  });
}

export function useControlCommands(vehicleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["vehicle-control-commands", vehicleId],
    queryFn: () => api.fetchControlCommands(vehicleId!),
    enabled: !!vehicleId && enabled,
  });
}

export function useControlVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, action, input }: { vehicleId: string; action: api.ControlAction; input: api.ControlInput }) =>
      api.controlVehicle(vehicleId, action, input),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["vehicle-control-commands", v.vehicleId] });
      qc.invalidateQueries({ queryKey: ["vehicle-telemetry", v.vehicleId] });
    },
  });
}

/** Kilometres per bike (today / 7 days / 30 days). Stored server-side, refreshed every 2 hours. */
export function useBikeKms() {
  return useQuery({
    queryKey: ["bike-kms"],
    queryFn: api.fetchBikeKms,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Refresh schedule and "last updated" for the tracking feeds. Polls faster while a manual refresh is running. */
export function useTrackingStatus(fast: boolean) {
  return useQuery({
    queryKey: ["tracking-status"],
    queryFn: api.fetchTrackingStatus,
    refetchInterval: fast ? 5_000 : 30_000,
  });
}

export function useRefreshTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: "live" | "distance") => api.refreshTracking(kind),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tracking-status"] }),
  });
}
