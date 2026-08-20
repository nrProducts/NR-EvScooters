import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import {
    getPermissionProfiles,
    resolvePermissionIds,
} from "../../common/permissionCatalog";
import { AuthContext, ModuleKey, PermissionKey, permissionKey } from "../../types";
import { getRole, requireLiveUser } from "./users.service";

/**
 * A staff account's individual grants.
 *
 * Storage moved: this used to be `public.staff_permissions`, one row per
 * module holding an `actions[]` array. It is now
 * `public.user_permission_overrides`, one row per permission, each carrying
 * an explicit `is_granted` boolean.
 *
 * Two consequences worth knowing:
 *
 *  - The console still speaks in modules-with-actions, because that is how a
 *    permission matrix reads. The flattening happens here, at the boundary.
 *
 *  - `is_granted = false` exists in the schema so a role-level grant can be
 *    *revoked* for one person. Nothing writes a denial today — staff hold no
 *    role grants (`role_permissions` is empty; see
 *    `v_user_effective_permissions`), so an absent row already means "no".
 *    Writing rows of `false` would be noise, and the view reads them
 *    identically. The column is honoured on read, not produced on write.
 *
 * Admin never has rows here at all; admin access is unconditional (see
 * `resolveAccess()` in authorize.middleware.ts, and the admin branch of the
 * view).
 */

export interface ModulePermission {
    module_key: ModuleKey;
    actions: string[];
}

export async function getModulePermissions(id: string): Promise<ModulePermission[]> {
    await requireLiveUser(id);

    const { data, error } = await supabaseAdmin
        .from("user_permission_overrides")
        .select("is_granted, permissions(module_key, action)")
        .eq("user_id", id)
        .eq("is_granted", true);
    if (error) throw error;

    const byModule = new Map<ModuleKey, string[]>();
    for (const row of data ?? []) {
        const p = Array.isArray(row.permissions) ? row.permissions[0] : row.permissions;
        if (!p) continue;
        const actions = byModule.get(p.module_key) ?? [];
        actions.push(p.action);
        byModule.set(p.module_key, actions);
    }

    return [...byModule.entries()]
        .map(([module_key, actions]) => ({ module_key, actions: actions.sort() }))
        .sort((a, b) => a.module_key.localeCompare(b.module_key));
}

/**
 * Full-replace: clears every existing grant for this user, then inserts the
 * new set.
 *
 * A module with an empty actions array writes no rows — which keeps "this
 * user has at least one action in the module" equivalent to "the module is
 * visible to them", the property `requireModule()` and the console sidebar
 * both rely on.
 */
export async function replaceModulePermissions(
    id: string,
    modules: ModulePermission[],
    actor: AuthContext,
    req?: Request,
    profileApplied?: string,
): Promise<ModulePermission[]> {
    await requireLiveUser(id);

    const role = await getRole(id);
    const toWrite = modules.filter((m) => m.actions.length > 0);
    if (toWrite.length > 0 && role !== "staff") {
        throw businessRule("Only accounts holding the staff role can be granted module permissions.");
    }

    const requested: PermissionKey[] = toWrite.flatMap((m) =>
        m.actions.map((action) => permissionKey(m.module_key, action)),
    );
    const { ids, unknown } = await resolvePermissionIds(requested);
    if (unknown.length > 0) {
        throw businessRule(
            unknown.length === 1
                ? `"${unknown[0]}" is not a permission this system defines.`
                : `These are not permissions this system defines: ${unknown.join(", ")}.`,
        );
    }

    const before = await getModulePermissions(id);

    const { error: deleteError } = await supabaseAdmin
        .from("user_permission_overrides")
        .delete()
        .eq("user_id", id);
    if (deleteError) throw deleteError;

    if (ids.length > 0) {
        const { error: insertError } = await supabaseAdmin
            .from("user_permission_overrides")
            .insert(
                ids.map((permission_id) => ({
                    user_id: id,
                    permission_id,
                    is_granted: true,
                    granted_by_user_id: actor.id,
                })),
            );
        if (insertError) throw insertError;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.permissions_changed",
        entityType: "user_permission",
        entityId: id,
        before: { modules: before },
        after: { modules: toWrite, ...(profileApplied ? { profile: profileApplied } : {}) },
        req,
    });

    return toWrite;
}

/**
 * Resolves a named preset (Viewer, Operations Staff, ...) and applies it
 * wholesale.
 *
 * The presets are rows in `permission_profiles` now, not a constant in
 * `config/permissionProfiles.ts` — so an operator can add one without a
 * deploy, and the console and the backend can no longer disagree about what
 * "Operations Staff" means.
 */
export async function applyPermissionProfile(
    id: string,
    profile: string,
    actor: AuthContext,
    req?: Request,
): Promise<ModulePermission[]> {
    const profiles = await getPermissionProfiles();
    const preset = profiles.find((p) => p.code === profile);
    if (!preset) throw notFound(`"${profile}" is not a recognised permission profile.`);

    const byModule = new Map<ModuleKey, string[]>();
    for (const key of preset.permissions) {
        // Split on the FIRST dot: an action never contains one, a module key
        // theoretically could.
        const dot = key.indexOf(".");
        if (dot < 1) continue;
        const moduleKey = key.slice(0, dot);
        const actions = byModule.get(moduleKey) ?? [];
        actions.push(key.slice(dot + 1));
        byModule.set(moduleKey, actions);
    }

    const modules: ModulePermission[] = [...byModule.entries()].map(
        ([module_key, actions]) => ({ module_key, actions }),
    );

    return replaceModulePermissions(id, modules, actor, req, preset.code);
}
