import { useQuery } from "@tanstack/react-query";
import { fetchPermissionCatalog } from "@/services/api/permissions";
import { CUSTOM_PROFILE, permissionKey } from "@/types";
import type {
  ModuleKey, ModulePermission, PermissionCatalog, PermissionDef, PermissionProfileName,
} from "@/types";

/**
 * The permission catalogue, fetched once and held.
 *
 * `staleTime: Infinity` on purpose: modules, permissions and profiles change
 * by MIGRATION, not at runtime. A user's grants change while they are logged
 * in and are refetched normally — the distinction is the whole reason a
 * revoked grant takes effect immediately while this does not need to.
 */
export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["permission-catalog"],
    queryFn: fetchPermissionCatalog,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** The permissions of one module, in catalogue order. */
export function permissionsForModule(
  catalog: PermissionCatalog,
  moduleKey: ModuleKey,
): PermissionDef[] {
  return catalog.permissions.filter((p) => p.moduleKey === moduleKey);
}

/**
 * A profile's grants, in the module-with-actions shape the matrix edits.
 *
 * The catalogue gives a profile a flat list of `"<module>.<action>"` keys,
 * because that is what a permission IS now; the console still groups them,
 * because that is how a permission matrix reads.
 */
export function profileToModules(
  catalog: PermissionCatalog,
  code: PermissionProfileName,
): ModulePermission[] {
  const profile = catalog.profiles.find((p) => p.code === code);
  if (!profile) return [];

  const byModule = new Map<ModuleKey, string[]>();
  for (const key of profile.permissions) {
    // Split on the FIRST dot only: an action may contain one
    // (`kyc.reveal_number`), a module key may not.
    const dot = key.indexOf(".");
    if (dot < 0) continue;
    const moduleKey = key.slice(0, dot);
    const action = key.slice(dot + 1);
    byModule.set(moduleKey, [...(byModule.get(moduleKey) ?? []), action]);
  }

  return [...byModule.entries()]
    .map(([module_key, actions]) => ({ module_key, actions: actions.sort() }))
    .sort((a, b) => a.module_key.localeCompare(b.module_key));
}

/**
 * Which named profile these grants are, or `"custom"`.
 *
 * Set equality on the flattened keys — the successor to the old
 * `matchProfileName`, which compared against hard-coded presets. Comparing
 * flat keys rather than the grouped shape means module ordering and array
 * ordering cannot produce a false "custom".
 */
export function matchProfileName(
  catalog: PermissionCatalog,
  granted: ModulePermission[],
): PermissionProfileName {
  const held = new Set(
    granted.flatMap((m) => m.actions.map((a) => permissionKey(m.module_key, a))),
  );

  for (const profile of catalog.profiles) {
    if (profile.permissions.length !== held.size) continue;
    if (profile.permissions.every((k) => held.has(k))) return profile.code;
  }
  return CUSTOM_PROFILE;
}
