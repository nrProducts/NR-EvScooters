import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./legal.controller";
import * as v from "./legal.validation";

/**
 * Rider-facing acceptance routes, mounted at /api/v1/users/me/legal.
 *
 * Acceptance is written here and nowhere else. legal_acceptances has no
 * insert policy at all, so the service role behind this router is the only
 * path to a row — a client that could write its own acceptance would not be
 * evidence of anything.
 */
export const riderLegalRouter = Router();
riderLegalRouter.use(requireAuth);

riderLegalRouter.get("/terms", asyncHandler(c.getMyTermsStateHandler));

riderLegalRouter.get("/acceptances", asyncHandler(c.getMyAcceptanceHistoryHandler));

riderLegalRouter.post(
    "/acceptances",
    validate({ body: v.acceptDocumentBody }),
    asyncHandler(c.acceptDocumentHandler),
);

/**
 * Document + admin routes, mounted at /api/v1/legal.
 *
 * The document itself is readable by any signed-in user, riders included — a
 * rider who cannot re-read the terms they accepted has not really accepted
 * them, and the profile screen links straight here. Only publishing and the
 * version history are privileged.
 */
export const legalRouter = Router();
legalRouter.use(requireAuth);

legalRouter.get(
    "/documents/:type",
    validate({ params: v.documentTypeParam, query: v.documentQuery }),
    asyncHandler(c.getDocumentHandler),
);

legalRouter.get(
    "/documents/:type/versions",
    requireAdmin,
    validate({ params: v.documentTypeParam }),
    asyncHandler(c.listDocumentsHandler),
);

legalRouter.post(
    "/documents",
    requireAdmin,
    validate({ body: v.publishDocumentBody }),
    asyncHandler(c.publishDocumentHandler),
);
