import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate, validatedQuery } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { listPreBookings } from "./preBooking.service";

/**
 * Admin console read side for pre-bookings — the "Pre-Bookings" tab on
 * Rental Operations (apps/web's BookingListPage). Staff-only, read-only: the
 * only writer is preBooking.service.ts's own service-role insert from the
 * public submission, same as every other admin-console write path.
 *
 * Gated on plain requireStaff, not a fine-grained action, matching
 * deposits.routes.ts's admin router — this is a read-only queue, not a
 * money-moving one.
 */
const router = Router();
router.use(requireAuth, requireStaff);

const listPreBookingsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

router.get(
    "/",
    validate({ query: listPreBookingsQuery }),
    asyncHandler(async (req, res) => {
        const { page, pageSize } = validatedQuery<z.infer<typeof listPreBookingsQuery>>(req);
        res.json(await listPreBookings({ page, pageSize }));
    }),
);

export default router;
