import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/notifications";

export function useNotificationLog(filters: api.NotificationFilters) {
  return useQuery({ queryKey: ["notifications", filters], queryFn: () => api.fetchNotifications(filters) });
}

export function useBroadcastNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.BroadcastInput) => api.broadcastNotification(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
