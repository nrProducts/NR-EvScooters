import { useQuery } from "@/lib/useQuery";
import * as api from "@/services/api/consent";

export function useUserConsents(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-consents", userId],
    queryFn: () => api.fetchUserConsents(userId!),
    enabled: !!userId,
  });
}

export function useConsentNotices() {
  return useQuery({ queryKey: ["consent-notices"], queryFn: api.fetchNotices });
}
