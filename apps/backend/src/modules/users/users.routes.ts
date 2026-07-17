import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
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
    asyncHandler(c.updateUserHandler),
);

// --- staff/admin --------------------------------------------------------
router.get(
    "/",
    requireStaff,
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
    requireStaff,
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
    requireStaff,
    validate({ params: v.uuidParam, body: v.updateStatusBody }),
    asyncHandler(c.updateStatusHandler),
);

router.get(
    "/:id/roles",
    validate({ params: v.uuidOrMeParam }),
    asyncHandler(c.getRolesHandler),
);

router.put(
    "/:id/roles",
    requireAdmin,
    validate({ params: v.uuidParam, body: v.updateRolesBody }),
    asyncHandler(c.updateRolesHandler),
);

export default router;
