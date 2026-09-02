import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/users";
import type { BackendRoleName, ModulePermission, PermissionProfileName } from "@/types";

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

export function useChangeUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: BackendRoleName }) => api.changeUserRole(id, role),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user", id] });
      // A role change can also invalidate any previously-granted module
      // permissions (e.g. demoting away from staff) — refetch to be safe.
      qc.invalidateQueries({ queryKey: ["user-permissions", id] });
    },
  });
}

/**
 * Approve a self-registered pending account and assign its role. One
 * admin endpoint — POST /users/:id/approve — which sets the profile row,
 * role and active status in the right order for the role/profile constraint
 * trigger (see users.service.ts approveSignup()).
 */
export function useApproveSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: "staff" | "rider" }) => api.approveSignup(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["reports", "pending-approvals"] });
    },
  });
}

/** Reject a self-registered pending account — soft-deletes it (recoverable via restore). */
export function useRejectSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["reports", "pending-approvals"] });
    },
  });
}

export function useUserPermissions(id: string | undefined) {
  return useQuery({
    queryKey: ["user-permissions", id],
    queryFn: () => api.fetchUserPermissions(id!),
    enabled: !!id,
  });
}

export function useApplyPermissionProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profile }: { id: string; profile: PermissionProfileName }) =>
      api.applyUserPermissionProfile(id, profile),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["user-permissions", id] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useCreateStaffUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CreateStaffInput) => api.createStaffUser(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, modules }: { id: string; modules: ModulePermission[] }) =>
      api.replaceUserPermissions(id, modules),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["user-permissions", id] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
