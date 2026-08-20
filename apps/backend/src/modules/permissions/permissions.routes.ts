import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./permissions.controller";

const router = Router();
router.use(requireAuth, requireStaff);

router.get("/catalog", asyncHandler(c.catalogHandler));

export default router;
