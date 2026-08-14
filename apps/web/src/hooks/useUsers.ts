import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/users";
import type { Capability } from "@/types";

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

export function useUserCapabilities(id: string | undefined) {
  return useQuery({
    queryKey: ["user-capabilities", id],
    queryFn: () => api.fetchUserCapabilities(id!),
    enabled: !!id,
  });
}

export function useReplaceCapabilities() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, capabilities }: { id: string; capabilities: Capability[] }) =>
      api.replaceUserCapabilities(id, capabilities),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["user-capabilities", id] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
