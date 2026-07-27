import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/notifications";
import type { NotificationItem } from "@/types";

export function useNotifications() {
  return useQuery({ queryKey: ["notifications"], queryFn: api.fetchNotifications });
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<NotificationItem>) => api.createNotification(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
