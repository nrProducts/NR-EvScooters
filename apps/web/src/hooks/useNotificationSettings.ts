import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/notificationSettings";
import type { NotificationType } from "@/types";

export function useNotificationSettings() {
  return useQuery({ queryKey: ["notification-settings"], queryFn: api.fetchNotificationSettings });
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
