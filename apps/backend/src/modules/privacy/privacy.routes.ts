import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction, requireAdmin } from "../../middleware/authorize.middleware";
import { requirePiiExporter, requireRightsOfficer } from "../../middleware/capability.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./privacy.controller";
import * as v from "./privacy.validation";

/**
 * Rider-facing rights routes, mounted at /api/v1/users/me/privacy.
 *
 * Every handler works off req.user.id. There is no path by which a rider can
 * name a different user here, which is what keeps the export endpoint from
 * being a way to read someone else's record.
 */
export const riderPrivacyRouter = Router();
riderPrivacyRouter.use(requireAuth);

riderPrivacyRouter.post(
    "/requests",
    validate({ body: v.createRequestBody }),
    asyncHandler(c.createMyRequestHandler),
);

riderPrivacyRouter.get(
    "/requests",
    validate({ query: v.listMyRequestsQuery }),
    asyncHandler(c.listMyRequestsHandler),
);

riderPrivacyRouter.get(
    "/requests/:id",
    validate({ params: v.uuidParam }),
    asyncHandler(c.getMyRequestHandler),
);

riderPrivacyRouter.post(
    "/requests/:id/cancel",
    validate({ params: v.uuidParam }),
    asyncHandler(c.cancelMyRequestHandler),
);

// Self-serve export (s.11). Rate-limited in the service, not here, so the
// rider gets a message explaining when they can try again rather than a 429.
riderPrivacyRouter.post("/export", asyncHandler(c.createMyExportHandler));

riderPrivacyRouter.get(
    "/export/:id/url",
    validate({ params: v.uuidParam }),
    asyncHandler(c.getMyExportUrlHandler),
);

// Nomination (s.14).
riderPrivacyRouter.get("/nominee", asyncHandler(c.getMyNomineeHandler));
riderPrivacyRouter.patch(
    "/nominee",
    validate({ body: v.updateNomineeBody }),
    asyncHandler(c.updateMyNomineeHandler),
);
riderPrivacyRouter.delete("/nominee", asyncHandler(c.deleteMyNomineeHandler));

/**
 * Staff queue, mounted at /api/v1/privacy.
 *
 * TWO GATES. requireAction("privacy","view") gets you to the door — it is the
 * same per-section grant every other console area uses. The rights_officer
 * capability gets you in: actioning a rights request means reading the
 * requester's personal data, so it is not something every ops agent granted
 * the section should hold by default.
 */
export const adminPrivacyRouter = Router();
adminPrivacyRouter.use(requireAuth, requireAction("privacy", "view"));

adminPrivacyRouter.get(
    "/requests",
    requireRightsOfficer,
    validate({ query: v.listRequestsQuery }),
    asyncHandler(c.listRequestsHandler),
);

adminPrivacyRouter.get(
    "/requests/:id",
    requireRightsOfficer,
    validate({ params: v.uuidParam }),
    asyncHandler(c.getRequestHandler),
);

// requireAction("privacy","process") stacks ON TOP of the router-level
// view-only gate, alongside (not instead of) requireRightsOfficer — acting on
// a rights request needs both the stronger module action grant and the
// capability, neither one substituting for the other.
adminPrivacyRouter.patch(
    "/requests/:id",
    requireAction("privacy", "process"),
    requireRightsOfficer,
    validate({ params: v.uuidParam, body: v.updateRequestBody }),
    asyncHandler(c.updateRequestHandler),
);

adminPrivacyRouter.post(
    "/requests/:id/reject",
    requireAction("privacy", "process"),
    requireRightsOfficer,
    validate({ params: v.uuidParam, body: v.rejectRequestBody }),
    asyncHandler(c.rejectRequestHandler),
);

// Erasure is admin-only and split in two: approval starts a cooling-off
// clock and is reversible; execution destroys the data and is not. The
// service additionally refuses to let one person do both when forcing.
adminPrivacyRouter.post(
    "/requests/:id/approve-erasure",
    requireAdmin,
    validate({ params: v.uuidParam }),
    asyncHandler(c.approveErasureHandler),
);

adminPrivacyRouter.post(
    "/requests/:id/execute-erasure",
    requireAdmin,
    validate({ params: v.uuidParam, body: v.executeErasureBody }),
    asyncHandler(c.executeErasureHandler),
);

// Generating someone else's export is reading their entire record, so it
// needs its own capability rather than riding on rights_officer.
adminPrivacyRouter.post(
    "/users/:userId/export",
    requirePiiExporter,
    validate({ params: z.object({ userId: z.string().uuid() }) }),
    asyncHandler(c.exportForUserHandler),
);
