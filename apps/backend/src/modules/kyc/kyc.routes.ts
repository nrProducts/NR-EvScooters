import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { requireKycReviewer } from "../../middleware/capability.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { kycUpload } from "./kyc.upload";
import * as c from "./kyc.controller";
import * as v from "./kyc.validation";

/**
 * Rider-facing routes, mounted at /api/v1/users/me/kyc.
 * Every handler works off req.user.id — there is no path by which a rider can
 * name a different user here.
 */
export const riderKycRouter = Router();
riderKycRouter.use(requireAuth);

riderKycRouter.get("/", asyncHandler(c.getMyKycHandler));

riderKycRouter.post(
    "/documents",
    kycUpload,
    validate({ body: v.uploadDocumentBody }),
    asyncHandler(c.uploadMyDocumentHandler),
);

riderKycRouter.patch(
    "/documents/:documentId",
    kycUpload,
    validate({ params: v.documentIdParam, body: v.updateDocumentBody }),
    asyncHandler(c.updateMyDocumentHandler),
);

riderKycRouter.delete(
    "/documents/:documentId",
    validate({ params: v.documentIdParam }),
    asyncHandler(c.deleteMyDocumentHandler),
);

riderKycRouter.get(
    "/documents/:documentId/url",
    validate({ params: v.documentIdParam, query: v.signedUrlQuery }),
    asyncHandler(c.documentUrlHandler),
);

riderKycRouter.post("/submit", asyncHandler(c.submitMyKycHandler));

/**
 * Admin/staff review routes, mounted at /api/v1/kyc.
 */
export const adminKycRouter = Router();
adminKycRouter.use(requireAuth, requireStaff);

adminKycRouter.get(
    "/",
    validate({ query: v.kycListQuery }),
    asyncHandler(c.listKycHandler),
);

// The queue itself stays requireStaff: it returns name, phone and status,
// which ops legitimately need, and locking it would make the reviewer
// workflow undiscoverable to the people who are supposed to request access.
//
// Everything below exposes the identity documents themselves — the detail
// view (date of birth, full address, document list) and the images — so it
// additionally requires the kyc_reviewer capability. Note documentUrlHandler
// is shared with riderKycRouter; the gate goes on the ADMIN router only,
// because the rider path already restricts to the document's own owner.
adminKycRouter.get(
    "/:userId",
    requireKycReviewer,
    validate({ params: v.userIdParam }),
    asyncHandler(c.getKycDetailHandler),
);

adminKycRouter.get(
    "/documents/:documentId/url",
    requireKycReviewer,
    validate({ params: v.documentIdParam, query: v.signedUrlQuery }),
    asyncHandler(c.documentUrlHandler),
);

// You cannot responsibly decide on a document you are not allowed to see.
adminKycRouter.post(
    "/documents/:documentId/verify",
    requireKycReviewer,
    validate({ params: v.documentIdParam }),
    asyncHandler(c.verifyDocumentHandler),
);

adminKycRouter.post(
    "/documents/:documentId/reject",
    requireKycReviewer,
    validate({ params: v.documentIdParam, body: v.rejectBody }),
    asyncHandler(c.rejectDocumentHandler),
);

adminKycRouter.post(
    "/:userId/approve",
    requireKycReviewer,
    validate({ params: v.userIdParam }),
    asyncHandler(c.approveKycHandler),
);

adminKycRouter.post(
    "/:userId/reject",
    requireKycReviewer,
    validate({ params: v.userIdParam, body: v.rejectBody }),
    asyncHandler(c.rejectKycHandler),
);
