import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireModule } from "../../middleware/authorize.middleware";
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
    requireModule("users"),
    validate({ query: v.listUsersQuery }),
    asyncHandler(c.listUsersHandler),
);

router.post(
    "/",
    requireAdmin,
    validate({ body: v.createUserBody }),
    asyncHandler(c.createUserHandler),
);

router.get(
    "/:id",
    validate({ params: v.uuidOrMeParam }),
    asyncHandler(c.getUserHandler),
);

router.patch(
    "/:id",
    requireModule("users"),
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
    requireModule("users"),
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

// --- capabilities (DPDPA least privilege over raw personal data) ----------
// Separate from permissions above, and deliberately so — see the two-layer
// note in src/types/index.ts. GET is self-or-staff (a staff member may check
// their own), PUT is admin-only and refuses self-modification in the service.
router.get(
    "/:id/capabilities",
    validate({ params: v.uuidOrMeParam }),
    asyncHandler(c.getCapabilitiesHandler),
);

router.put(
    "/:id/capabilities",
    requireAdmin,
    validate({ params: v.uuidParam, body: v.updateCapabilitiesBody }),
    asyncHandler(c.updateCapabilitiesHandler),
);

export default router;
