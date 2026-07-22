import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./bookings.service";
import { CreateBookingBody } from "./bookings.validation";

export async function createBookingHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateBookingBody;
    const booking = await service.createBooking(body, req.user!);
    res.status(201).json(booking);
}

export async function myCurrentBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentBooking(req.user!.id));
}
