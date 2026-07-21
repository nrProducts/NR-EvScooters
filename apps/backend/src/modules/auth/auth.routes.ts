import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./auth.controller";
import * as v from "./auth.validation";

const router = Router();

// Everything here needs a verified Supabase token. Login itself (phone OTP /
// Google) happens directly against Supabase Auth from the client — the API is
// a resource server, it does not broker the sign-in.
router.use(requireAuth);

router.get("/session", asyncHandler(c.sessionHandler));
router.post("/logout", asyncHandler(c.logoutHandler));

// Ops diagnostic: prove MSG91 delivery works in this environment.
router.post(
    "/otp/test",
    requireAdmin,
    validate({ body: v.otpTestBody }),
    asyncHandler(c.otpTestHandler),
);

export default router;
