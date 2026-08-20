import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./damages.controller";
import * as v from "./damages.validation";

/**
 * Mounted at /api/v1/damages. List/resolve are staff-only; get/dispute are
 * shared but ownership-checked in the service for a non-staff caller (see
 * getDamageForActor) — a rider must only ever see their own booking's damage.
 *
 * Staff routes carry a specific action rather than the coarse
 * requireModule("damages"): reading the damage queue and deciding whether a
 * rider is charged for one are different authorities.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("damages", "view"),
    validate({ query: v.listDamagesQuery }),
    asyncHandler(c.listDamagesHandler),
);

// Declared before "/:id" so "me" is never parsed as a uuid param — same care
// already taken for GET /users/me vs GET /users/:id.
router.get("/me", validate({ query: v.myDamagesQuery }), asyncHandler(c.myDamagesForBookingHandler));

router.get(
    "/:id",
    validate({ params: v.damageIdParam }),
    asyncHandler(c.getDamageHandler),
);

router.post(
    "/:id/dispute",
    validate({ params: v.damageIdParam, body: v.disputeDamageBody }),
    asyncHandler(c.disputeDamageHandler),
);

// Resolving a dispute decides whether the rider is charged for the damage —
// `damages.edit`, not `damages.view`. Under the previous coarse
// requireModule("damages") gate, a read-only grant carried this authority.
router.post(
    "/:id/resolve",
    requireAction("damages", "edit"),
    validate({ params: v.damageIdParam, body: v.resolveDisputeBody }),
    asyncHandler(c.resolveDisputeHandler),
);

export default router;
