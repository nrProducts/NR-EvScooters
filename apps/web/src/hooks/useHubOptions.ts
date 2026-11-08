import { useQuery } from "@/lib/useQuery";
import { fetchHubOptions } from "@/services/api/vehicles";

export function useHubOptions() {
  return useQuery({ queryKey: ["hub-options"], queryFn: fetchHubOptions });
}
