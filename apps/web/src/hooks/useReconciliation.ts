import { useQuery } from "@/lib/useQuery";
import { fetchReconciliation } from "@/services/api/reconciliation";

export function useReconciliation(from: string, to: string) {
  return useQuery({
    queryKey: ["reconciliation", from, to],
    queryFn: () => fetchReconciliation(from, to),
  });
}
