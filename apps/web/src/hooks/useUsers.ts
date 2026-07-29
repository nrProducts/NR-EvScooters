import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/users";

export function useUsers(filters: api.UserFilters) {
  return useQuery({ queryKey: ["users", filters], queryFn: () => api.fetchUsers(filters) });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => api.fetchUserById(id!),
    enabled: !!id,
  });
}

export function useOpenUserPhoto() {
  return useMutation({
    mutationFn: (id: string) => api.fetchUserPhotoUrl(id),
  });
}

export function useChangeUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "activate" | "deactivate" | "suspend";
      reason?: string;
    }) => api.changeUserStatus(id, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useRestoreUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}
