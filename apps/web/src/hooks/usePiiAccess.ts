import { useQuery } from "@/lib/useQuery";
import * as api from "@/services/api/piiAccess";

export function usePiiAccess(filters: api.PiiAccessFilters) {
  return useQuery({ queryKey: ["pii-access", filters], queryFn: () => api.fetchPiiAccess(filters) });
}
