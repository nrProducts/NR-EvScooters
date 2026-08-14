import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./geocode.controller";
import * as v from "./geocode.validation";

/**
 * Mounted at /api/v1/geocode.
 *
 * Exists so the mobile app stops calling a third-party geocoder directly with
 * the rider's exact coordinates. Routing it through here means the disclosure
 * is coarsened (see geocode.service.ts), carries no rider identity, and
 * happens against an endpoint we can change, contract for, or switch off —
 * none of which was true when the handset called it.
 *
 * requireAuth is not about protecting the upstream data (it is public); it is
 * so an anonymous caller cannot use our backend as an open relay.
 */
const router = Router();
router.use(requireAuth);

router.get("/search", validate({ query: v.searchAreasQuery }), asyncHandler(c.searchAreasHandler));

export default router;
