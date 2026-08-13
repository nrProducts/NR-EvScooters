import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext, ModuleKey } from "../../types";
import { getRoles, requireLiveUser } from "./users.service";

/**
 * Per-user module grants (public.staff_permissions) — a staff account's
 * individual access, on top of the coarse "staff" role. Admin never has
 * rows here; admin access is unconditional (see requireModule() in
 * authorize.middleware.ts, which never even queries this table for an
 * admin caller). Mirrors getRoles/replaceRoles in users.service.ts.
 */

export async function getModulePermissions(id: string): Promise<ModuleKey[]> {
    await requireLiveUser(id);
    const { data, error } = await supabaseAdmin
        .from("staff_permissions")
        .select("module_key")
        .eq("user_id", id);
    if (error) throw error;
    return (data ?? []).map((row) => row.module_key as ModuleKey);
}

export async function replaceModulePermissions(
    id: string,
    modules: ModuleKey[],
    actor: AuthContext,
    req?: Request,
): Promise<ModuleKey[]> {
    await requireLiveUser(id);

    const roles = await getRoles(id);
    if (modules.length > 0 && !roles.includes("staff")) {
        throw businessRule("Only accounts holding the staff role can be granted module permissions.");
    }

    const before = await getModulePermissions(id);

    // Full-replace: clear existing grants, then (re-)insert the new set.
    // `in (...)` can't take an empty list, so an all-clear (modules: [])
    // just deletes every row for this user instead of filtering.
    let deleteQuery = supabaseAdmin.from("staff_permissions").delete().eq("user_id", id);
    if (modules.length > 0) deleteQuery = deleteQuery.not("module_key", "in", `(${modules.join(",")})`);
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    if (modules.length > 0) {
        const { error: insertError } = await supabaseAdmin.from("staff_permissions").upsert(
            modules.map((moduleKey) => ({ user_id: id, module_key: moduleKey, granted_by: actor.id })),
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
        after: { modules },
        req,
    });

    return modules;
}
