import { supabaseAdmin } from "../config/supabase";
import {
    ModuleDef,
    ModuleKey,
    PermissionAction,
    PermissionDef,
    PermissionKey,
    PermissionProfileDef,
    permissionKey,
} from "../types";

/**
 * The permission catalogue — `modules`, `permissions` and
 * `permission_profiles`, read from the database and cached.
 *
 * This file replaces `config/permissionProfiles.ts` and the `MODULE_KEYS` /
 * `MODULE_ACTIONS` constants that used to live in `types/index.ts`, both of
 * which were hand-maintained code mirrors of database rows — and both of which
 * had to be edited, in two apps, alongside every migration that touched a
 * grant. The tables are the source of truth now; this is just a cache in front
 * of them.
 *
 * The cache is deliberate. Every permission write goes through
 * {@link invalidatePermissionCatalog}, and the catalogue itself only changes
 * by migration — unlike a user's *grants*, which change at runtime and are
 * therefore read fresh on every request in `requireAuth`. Do not cache those
 * here; the distinction is the whole reason a revoked grant takes effect
 * immediately.
 */

/** How long a loaded catalogue is trusted. Short enough that a migration
 * applied against a running instance is picked up without a restart. */
const TTL_MS = 5 * 60 * 1000;

interface Catalog {
    modules: ModuleDef[];
    permissions: PermissionDef[];
    profiles: PermissionProfileDef[];
    /** `"<module>.<action>"` → `permissions.id`. */
    idByKey: Map<PermissionKey, string>;
    loadedAt: number;
}

let cached: Catalog | null = null;
let inFlight: Promise<Catalog> | null = null;

/** Forces the next read to hit the database. Call after any catalogue write. */
export function invalidatePermissionCatalog(): void {
    cached = null;
    inFlight = null;
}

async function load(): Promise<Catalog> {
    const [modulesRes, permissionsRes, profilesRes] = await Promise.all([
        supabaseAdmin
            .from("modules")
            .select("key, label, description, sort_order, is_active")
            .order("sort_order"),
        supabaseAdmin
            .from("permissions")
            .select("id, module_key, action, label, description, is_enforced")
            .order("module_key")
            .order("action"),
        supabaseAdmin
            .from("permission_profiles")
            .select(
                "code, label, description, sort_order, is_system, permission_profile_permissions(permissions(module_key, action))",
            )
            .order("sort_order"),
    ]);

    if (modulesRes.error) throw modulesRes.error;
    if (permissionsRes.error) throw permissionsRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const permissions: PermissionDef[] = (permissionsRes.data ?? []).map((row) => ({
        id: row.id,
        moduleKey: row.module_key,
        action: row.action,
        label: row.label,
        description: row.description,
        isEnforced: row.is_enforced,
    }));

    return {
        modules: (modulesRes.data ?? []).map((row) => ({
            key: row.key,
            label: row.label,
            description: row.description,
            sortOrder: row.sort_order,
            isActive: row.is_active,
        })),
        permissions,
        profiles: (profilesRes.data ?? []).map((row) => ({
            code: row.code,
            label: row.label,
            description: row.description,
            sortOrder: row.sort_order,
            isSystem: row.is_system,
            permissions: (row.permission_profile_permissions ?? []).flatMap((link) => {
                const p = link.permissions;
                if (!p) return [];
                const one = Array.isArray(p) ? p[0] : p;
                return one ? [permissionKey(one.module_key, one.action)] : [];
            }),
        })),
        idByKey: new Map(
            permissions.map((p) => [permissionKey(p.moduleKey, p.action), p.id] as const),
        ),
        loadedAt: Date.now(),
    };
}

async function catalog(): Promise<Catalog> {
    if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached;
    // Collapse a thundering herd on cold start into one query set.
    inFlight ??= load()
        .then((next) => {
            cached = next;
            return next;
        })
        .finally(() => {
            inFlight = null;
        });
    return inFlight;
}

export async function getModules(): Promise<ModuleDef[]> {
    return (await catalog()).modules;
}

export async function getPermissions(): Promise<PermissionDef[]> {
    return (await catalog()).permissions;
}

export async function getPermissionProfiles(): Promise<PermissionProfileDef[]> {
    return (await catalog()).profiles;
}

/** `permissions.id` for a `<module>.<action>` pair, or null if no such pair. */
export async function permissionIdFor(
    moduleKey: ModuleKey,
    action: PermissionAction,
): Promise<string | null> {
    return (await catalog()).idByKey.get(permissionKey(moduleKey, action)) ?? null;
}

/**
 * Resolves many pairs at once, reporting every unknown one together.
 *
 * Validating the whole set before writing any of it is what the old
 * `isValidModuleAction()` loop did; the difference is that "valid" is now a
 * row in `permissions` rather than an entry in a hard-coded table, so a
 * permission the database has never heard of can no longer be granted.
 */
export async function resolvePermissionIds(
    keys: readonly PermissionKey[],
): Promise<{ ids: string[]; unknown: PermissionKey[] }> {
    const { idByKey } = await catalog();
    const ids: string[] = [];
    const unknown: PermissionKey[] = [];
    for (const key of keys) {
        const id = idByKey.get(key);
        if (id) ids.push(id);
        else unknown.push(key);
    }
    return { ids: [...new Set(ids)], unknown };
}
