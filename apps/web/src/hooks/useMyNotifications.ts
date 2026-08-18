import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/notifications";

export function useMyNotifications(filters: api.MyNotificationFilters = {}) {
  return useQuery({ queryKey: ["my-notifications", filters], queryFn: () => api.fetchMyNotifications(filters) });
}

export function useUnreadCount() {
  return useQuery({ queryKey: ["my-notifications-unread-count"], queryFn: api.fetchUnreadCount });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
      qc.invalidateQueries({ queryKey: ["my-notifications-unread-count"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
      qc.invalidateQueries({ queryKey: ["my-notifications-unread-count"] });
    },
  });
}
