import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireAction, requireSelfOrStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { photoUpload } from "./users.photo.upload";
import * as c from "./users.controller";
import * as v from "./users.validation";

const router = Router();

// Everything below requires a verified token; roles come from the DB.
router.use(requireAuth);

// --- self-service -------------------------------------------------------
// Declared before "/:id" so "me" is never parsed as a uuid param.
router.get("/me", asyncHandler(c.meHandler));
router.patch(
    "/me",
    validate({ body: v.selfUpdateUserBody }),
    asyncHandler(c.updateMyProfileHandler),
);
router.post("/me/photo", photoUpload, asyncHandler(c.uploadMyPhotoHandler));
router.get("/me/photo/url", asyncHandler(c.myPhotoUrlHandler));
router.post(
    "/me/push-token",
    validate({ body: v.registerPushTokenBody }),
    asyncHandler(c.registerPushTokenHandler),
);

// --- staff/admin --------------------------------------------------------
router.get(
    "/",
    requireAction("users", "view"),
    validate({ query: v.listUsersQuery }),
    asyncHandler(c.listUsersHandler),
);

router.post(
    "/",
    // Stays admin-only regardless of any "users" grant — creating any
    // account (rider included) is not delegable; see MODULE_ACTIONS in
    // types/index.ts ("users.create" is marked unavailable for this reason).
    requireAdmin,
    validate({ body: v.createUserBody }),
    asyncHandler(c.createUserHandler),
);

// Self or staff. This is the most PII-dense endpoint in the system —
// PROFILE_SELECT returns name, email, phone, date of birth, gender, the full
// postal address and the emergency contact — and it carried no authorisation
// check at all, so any authenticated rider could read any other user's
// profile by uuid. Uuids are not secret: riders receive other users' ids
// through support threads, damage disputes and booking payloads.
//
// The two routes below already did this inline; this one did not, and the
// purpose-built middleware existed unused. Not requireAction("users","view"):
// a rider must still be able to read their own record through the "me" alias.
router.get(
    "/:id",
    validate({ params: v.uuidOrMeParam }),
    requireSelfOrStaff(),
    asyncHandler(c.getUserHandler),
);

router.patch(
    "/:id",
    requireAction("users", "edit"),
    validate({ params: v.uuidParam, body: v.updateUserBody }),
    asyncHandler(c.updateUserHandler),
);

router.delete(
    "/:id",
    requireAdmin,
    validate({ params: v.uuidParam }),
    asyncHandler(c.deleteUserHandler),
);

router.post(
    "/:id/restore",
    requireAdmin,
    validate({ params: v.uuidParam }),
    asyncHandler(c.restoreUserHandler),
);

router.patch(
    "/:id/status",
    requireAction("users", "suspend"),
    validate({ params: v.uuidParam, body: v.updateStatusBody }),
    asyncHandler(c.updateStatusHandler),
);

router.get(
    "/:id/roles",
    validate({ params: v.uuidOrMeParam }),
    asyncHandler(c.getRolesHandler),
);

router.get(
    "/:id/photo/url",
    validate({ params: v.uuidOrMeParam }),
    asyncHandler(c.getUserPhotoUrlHandler),
);

router.put(
    "/:id/roles",
    requireAdmin,
    validate({ params: v.uuidParam, body: v.updateRolesBody }),
    asyncHandler(c.updateRolesHandler),
);

// --- module permissions (which console sections a staff account may open) --
router.get(
    "/:id/permissions",
    requireAdmin,
    validate({ params: v.uuidParam }),
    asyncHandler(c.getPermissionsHandler),
);

router.put(
    "/:id/permissions",
    requireAdmin,
    validate({ params: v.uuidParam, body: v.updatePermissionsBody }),
    asyncHandler(c.updatePermissionsHandler),
);

router.post(
    "/:id/permissions/apply-profile",
    requireAdmin,
    validate({ params: v.uuidParam, body: v.applyPermissionProfileBody }),
    asyncHandler(c.applyPermissionProfileHandler),
);

// The /:id/capabilities pair is gone. Capabilities are ordinary permissions
// now — kyc.reveal_number, privacy.process, privacy.export — so they are
// granted and read through /:id/permissions above, with no second endpoint,
// no second table and no second middleware. See src/types/index.ts.

export default router;
