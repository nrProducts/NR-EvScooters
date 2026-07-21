import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
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

adminKycRouter.get(
    "/:userId",
    validate({ params: v.userIdParam }),
    asyncHandler(c.getKycDetailHandler),
);

adminKycRouter.get(
    "/documents/:documentId/url",
    validate({ params: v.documentIdParam, query: v.signedUrlQuery }),
    asyncHandler(c.documentUrlHandler),
);

adminKycRouter.post(
    "/documents/:documentId/verify",
    validate({ params: v.documentIdParam }),
    asyncHandler(c.verifyDocumentHandler),
);

adminKycRouter.post(
    "/documents/:documentId/reject",
    validate({ params: v.documentIdParam, body: v.rejectBody }),
    asyncHandler(c.rejectDocumentHandler),
);

adminKycRouter.post(
    "/:userId/approve",
    validate({ params: v.userIdParam }),
    asyncHandler(c.approveKycHandler),
);

adminKycRouter.post(
    "/:userId/reject",
    validate({ params: v.userIdParam, body: v.rejectBody }),
    asyncHandler(c.rejectKycHandler),
);
