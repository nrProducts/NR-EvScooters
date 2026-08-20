import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/notificationSettings";
import type { NotificationType } from "@/types";

/** Admin-only: full config plus subscriber lists, for the Notification Manager. */
export function useNotificationSettings() {
  return useQuery({ queryKey: ["notification-settings"], queryFn: api.fetchNotificationSettings });
}

/**
 * Staff-readable: just enough catalogue to tell a task from news. Used by the
 * realtime layer, which runs for staff as well as admin.
 */
export function useNotificationTypeSummaries() {
  return useQuery({
    queryKey: ["notification-type-summaries"],
    queryFn: api.fetchNotificationTypeSummaries,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificationSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, input }: { type: NotificationType; input: api.UpdateNotificationSettingInput }) =>
      api.updateNotificationSetting(type, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
    },
  });
}
