import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext, ModuleKey, isValidModuleAction } from "../../types";
import { PERMISSION_PROFILES, PermissionProfileName } from "../../config/permissionProfiles";
import { getRoles, requireLiveUser } from "./users.service";

/**
 * Per-user module+action grants (public.staff_permissions) — a staff
 * account's individual access, on top of the coarse "staff" role. Admin
 * never has rows here; admin access is unconditional (see requireModule()/
 * requireAction() in authorize.middleware.ts, which never even query this
 * table for an admin caller). Mirrors getRoles/replaceRoles in
 * users.service.ts.
 */

export interface ModulePermission {
    module_key: ModuleKey;
    actions: string[];
}

export async function getModulePermissions(id: string): Promise<ModulePermission[]> {
    await requireLiveUser(id);
    const { data, error } = await supabaseAdmin
        .from("staff_permissions")
        .select("module_key, actions")
        .eq("user_id", id);
    if (error) throw error;
    return (data ?? []).map((row) => ({
        module_key: row.module_key as ModuleKey,
        actions: (row.actions as string[] | null) ?? [],
    }));
}

/**
 * Full-replace, same shape as the old module-only version: clears every
 * existing grant for this user, then (re-)inserts the new set. A module
 * with an empty actions array is never stored as a row — that's how a
 * staff_permissions row's mere existence stays equivalent to "at least one
 * action granted", which is what requireModule()/sidebar visibility rely on.
 */
export async function replaceModulePermissions(
    id: string,
    modules: ModulePermission[],
    actor: AuthContext,
    req?: Request,
    profileApplied?: PermissionProfileName,
): Promise<ModulePermission[]> {
    await requireLiveUser(id);

    const roles = await getRoles(id);
    const toWrite = modules.filter((m) => m.actions.length > 0);
    if (toWrite.length > 0 && !roles.includes("staff")) {
        throw businessRule("Only accounts holding the staff role can be granted module permissions.");
    }
    for (const m of toWrite) {
        for (const action of m.actions) {
            if (!isValidModuleAction(m.module_key, action)) {
                throw businessRule(`"${action}" is not a valid action for the "${m.module_key}" module.`);
            }
        }
    }

    const before = await getModulePermissions(id);

    const { error: deleteError } = await supabaseAdmin
        .from("staff_permissions")
        .delete()
        .eq("user_id", id);
    if (deleteError) throw deleteError;

    if (toWrite.length > 0) {
        const { error: insertError } = await supabaseAdmin.from("staff_permissions").upsert(
            toWrite.map((m) => ({
                user_id: id,
                module_key: m.module_key,
                actions: m.actions,
                granted_by: actor.id,
            })),
            { onConflict: "user_id,module_key", ignoreDuplicates: true },
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

/** Resolves a named preset (Viewer, Operations Staff, ...) and applies it wholesale. */
export async function applyPermissionProfile(
    id: string,
    profile: Exclude<PermissionProfileName, "custom">,
    actor: AuthContext,
    req?: Request,
): Promise<ModulePermission[]> {
    const preset = PERMISSION_PROFILES[profile];
    if (!preset) throw businessRule(`"${profile}" is not a recognised permission profile.`);

    const modules: ModulePermission[] = Object.entries(preset.modules).map(([module_key, actions]) => ({
        module_key: module_key as ModuleKey,
        actions: [...(actions ?? [])],
    }));

    return replaceModulePermissions(id, modules, actor, req, profile);
}
