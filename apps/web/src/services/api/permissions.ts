import { apiClient } from "./httpClient";
import type { PermissionCatalog } from "@/types";

/**
 * The permission catalogue — modules, permissions and profiles.
 *
 * This replaces three hard-coded tables that used to live in the console:
 * `MODULE_KEYS`, `MODULE_ACTIONS` and `config/permissionProfiles.ts`. All
 * three were hand-maintained mirrors of database rows, edited in two
 * repositories alongside every migration that touched a grant, and each could
 * drift from what the backend actually enforced without anything noticing.
 *
 * One request, because the matrix needs all of it to draw one screen and a
 * profile means nothing without the permissions it names.
 */
export async function fetchPermissionCatalog(): Promise<PermissionCatalog> {
  return apiClient.get<PermissionCatalog>("/permissions/catalog");
}
