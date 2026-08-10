import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { notFound } from "../../common/AppError";
import { supabaseAdmin } from "../../config/supabase";
import * as service from "./deposits.service";
import { ListDepositsFilters } from "./deposits.types";

export async function listDepositsHandler(req: AuthedRequest, res: Response) {
    const { status, refundEligible, ...page } = validatedQuery<ListDepositsFilters>(req);
    res.json(await service.listDeposits({ ...page, status, refundEligible }));
}

export async function getDepositForBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getDepositForBooking(req.params.bookingId as string));
}

/** Rider's own deposit — scoped by ownership of the booking, not staff-only. */
export async function myDepositForBookingHandler(req: AuthedRequest, res: Response) {
    const bookingId = req.params.bookingId as string;
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id")
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!booking || booking.user_id !== req.user!.id) throw notFound("Booking not found.");
    res.json(await service.getDepositForBooking(bookingId));
}
