import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./deposits.controller";
import * as v from "./deposits.validation";

const adminRouter = Router();
adminRouter.use(requireAuth, requireStaff);
adminRouter.get("/", validate({ query: v.listDepositsQuery }), asyncHandler(c.listDepositsHandler));
adminRouter.get(
    "/booking/:bookingId",
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.getDepositForBookingHandler),
);

const riderRouter = Router();
riderRouter.use(requireAuth);
riderRouter.get(
    "/booking/:bookingId",
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.myDepositForBookingHandler),
);

export { adminRouter, riderRouter };
