import { Router } from "express";
import { asyncHandler } from "../../common/asyncHandler";
import * as service from "./public.service";

/**
 * Unauthenticated read-only endpoints for the public marketing site
 * (apps/website). Mounted at /public — no auth middleware, on purpose.
 * Keep everything here PII-free and cheap.
 */
const router = Router();

// A short CDN/browser cache — the marketing site does not need second-by-second
// freshness, and this shields the DB from crawler traffic.
router.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");
    next();
});

router.get("/plans", asyncHandler(async (_req, res) => {
    res.json({ plans: await service.getPublicPlans() });
}));

router.get("/stats", asyncHandler(async (_req, res) => {
    res.json(await service.getPublicStats());
}));

export default router;
