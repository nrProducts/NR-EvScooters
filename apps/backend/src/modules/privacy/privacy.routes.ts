import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction, requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./privacy.controller";
import * as v from "./privacy.validation";

/**
 * Rider-facing rights routes, mounted at /api/v1/users/me/privacy.
 *
 * Every handler works off req.user.id. There is no path by which a rider can
 * name a different user here, which is what keeps the summary endpoint from
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

// Self-serve access summary (s.11). A read of the rider's own record: no
// request row, no rate limit, no generated file.
riderPrivacyRouter.get("/summary", asyncHandler(c.getMySummaryHandler));

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
    requireAction("privacy", "process"),
    validate({ query: v.listRequestsQuery }),
    asyncHandler(c.listRequestsHandler),
);

adminPrivacyRouter.get(
    "/requests/:id",
    requireAction("privacy", "process"),
    validate({ params: v.uuidParam }),
    asyncHandler(c.getRequestHandler),
);

// requireAction("privacy","process") stacks ON TOP of the router-level
// view-only gate. It used to stack alongside a separate rights_officer
// capability too; that capability IS privacy.process now, so the pair
// collapsed into the single check without loosening anything.
adminPrivacyRouter.patch(
    "/requests/:id",
    requireAction("privacy", "process"),
    validate({ params: v.uuidParam, body: v.updateRequestBody }),
    asyncHandler(c.updateRequestHandler),
);

adminPrivacyRouter.post(
    "/requests/:id/reject",
    requireAction("privacy", "process"),
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

// Reading someone else's summary is reading their entire record, so it needs
// its own permission rather than riding on privacy.process. The action key is
// still "export" because that is what is seeded in the database and held by
// existing staff grants; what it gates is now a read, not a file.
adminPrivacyRouter.get(
    "/users/:userId/summary",
    requireAction("privacy", "export"),
    validate({ params: z.object({ userId: z.string().uuid() }) }),
    asyncHandler(c.summaryForUserHandler),
);
