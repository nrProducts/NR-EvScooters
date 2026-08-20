import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth.middleware";
import {
    getModules,
    getPermissionProfiles,
    getPermissions,
} from "../../common/permissionCatalog";

/**
 * The permission catalogue, as one document.
 *
 * This endpoint exists because deleting `config/permissionProfiles.ts` left
 * the admin console with nothing to render its permission matrix from. The
 * console used to hold three hand-maintained mirrors of database rows —
 * `MODULE_KEYS`, `MODULE_ACTIONS` and the profile presets — each of which had
 * to be edited in two repositories alongside every migration that touched a
 * grant, and each of which could silently drift from what the backend
 * actually enforced.
 *
 * Served as a single document rather than three endpoints: the console needs
 * all of it to draw one screen, and a profile is meaningless without the
 * permissions it names.
 *
 * Readable by any authenticated staff member, not just admins. The matrix is
 * admin-only to EDIT, but the sidebar and every "you do not have access to
 * this section" message need the module labels, and a list of what
 * permissions exist reveals nothing about who holds them.
 */
export async function catalogHandler(_req: AuthedRequest, res: Response) {
    const [modules, permissions, profiles] = await Promise.all([
        getModules(),
        getPermissions(),
        getPermissionProfiles(),
    ]);

    res.json({ modules, permissions, profiles });
}
