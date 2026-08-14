import type { ModuleKey, ModulePermission, Role } from "@/types";

/** What hasAction/hasModule need — the same shape used by roleConfig.ts's canAccess. */
export interface PermissionUser {
  role: Role;
  permissions: ModulePermission[] | null;
}

/**
 * Single source of truth for "can this staff account do X inside a module
 * they can already open" — used by roleConfig.ts (nav/route gating), the
 * Permission Matrix page, and every page-level button gate. Admin bypasses
 * unconditionally, same as the backend's hasAction()/hasModule().
 */
export function hasAction(user: PermissionUser | null | undefined, moduleKey: ModuleKey, action: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions?.some((p) => p.module_key === moduleKey && p.actions.includes(action)) ?? false;
}

/** True if any action at all is granted for this module — "can this section be opened". */
export function hasModule(user: PermissionUser | null | undefined, moduleKey: ModuleKey): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions?.some((p) => p.module_key === moduleKey && p.actions.length > 0) ?? false;
}
