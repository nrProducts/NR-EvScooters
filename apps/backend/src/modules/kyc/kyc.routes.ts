import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
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
adminKycRouter.use(requireAuth, requireAction("kyc", "view"));

adminKycRouter.get(
    "/",
    validate({ query: v.kycListQuery }),
    asyncHandler(c.listKycHandler),
);

// TWO GATES, deliberately. requireAction("kyc","view") above admits anyone
// granted the KYC section — the queue returns name, phone and status, which
// ops legitimately need to chase riders for missing documents.
//
// Everything below exposes the identity documents THEMSELVES — the detail
// view (date of birth, full address) and the images — so it additionally
// requires the kyc_reviewer capability, which no role or module implies. An
// ops agent can therefore work the queue without ever being able to open an
// Aadhaar scan, which modules alone cannot express.
//
// Note documentUrlHandler is shared with riderKycRouter; the capability gate
// goes on the ADMIN router only, because the rider path already restricts to
// the document's own owner.
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
// requireAction("kyc","review") on top of the router-level view-only gate,
// because deciding on a document is stronger than merely opening the queue.
adminKycRouter.post(
    "/documents/:documentId/verify",
    requireAction("kyc", "review"),
    requireKycReviewer,
    validate({ params: v.documentIdParam }),
    asyncHandler(c.verifyDocumentHandler),
);

adminKycRouter.post(
    "/documents/:documentId/reject",
    requireAction("kyc", "review"),
    requireKycReviewer,
    validate({ params: v.documentIdParam, body: v.rejectBody }),
    asyncHandler(c.rejectDocumentHandler),
);

adminKycRouter.post(
    "/:userId/approve",
    requireAction("kyc", "review"),
    requireKycReviewer,
    validate({ params: v.userIdParam }),
    asyncHandler(c.approveKycHandler),
);

adminKycRouter.post(
    "/:userId/reject",
    requireAction("kyc", "review"),
    requireKycReviewer,
    validate({ params: v.userIdParam, body: v.rejectBody }),
    asyncHandler(c.rejectKycHandler),
);
