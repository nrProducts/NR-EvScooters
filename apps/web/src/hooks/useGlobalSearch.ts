import { useQuery } from "@tanstack/react-query";
import * as usersApi from "@/services/api/users";
import * as vehiclesApi from "@/services/api/vehicles";

/** Header search bar — only real, search-capable list endpoints are wired in. */
export function useGlobalSearch(term: string) {
  const enabled = term.trim().length >= 2;

  const users = useQuery({
    queryKey: ["global-search", "users", term],
    queryFn: () => usersApi.fetchUsers({ search: term, pageSize: 5 }),
    enabled,
  });

  const vehicles = useQuery({
    queryKey: ["global-search", "vehicles", term],
    queryFn: () => vehiclesApi.fetchVehicles({ search: term, pageSize: 5 }),
    enabled,
  });

  return {
    enabled,
    isLoading: enabled && (users.isLoading || vehicles.isLoading),
    users: users.data?.data ?? [],
    vehicles: vehicles.data?.data ?? [],
  };
}
