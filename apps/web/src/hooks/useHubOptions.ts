import { useQuery } from "@tanstack/react-query";
import { fetchHubOptions } from "@/services/api/vehicles";

export function useHubOptions() {
  return useQuery({ queryKey: ["hub-options"], queryFn: fetchHubOptions });
}
