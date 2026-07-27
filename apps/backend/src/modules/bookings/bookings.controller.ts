import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./bookings.service";
import {
    BookingHistoryQuery, ConfirmPickupBody, CreateBookingBody, PickupQueueQuery, RejectBookingBody,
} from "./bookings.validation";

export async function createBookingHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateBookingBody;
    const booking = await service.createBooking(body, req.user!);
    res.status(201).json(booking);
}

export async function myCurrentBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentBooking(req.user!.id));
}

export async function myBookingHistoryHandler(req: AuthedRequest, res: Response) {
    const page = validatedQuery<BookingHistoryQuery>(req);
    res.json(await service.getMyBookingHistory(req.user!.id, page));
}

export async function pickupQueueHandler(req: AuthedRequest, res: Response) {
    const { stationId, ...page } = validatedQuery<PickupQueueQuery>(req);
    res.json(await service.listPickupQueue({ ...page, stationId }));
}

export async function confirmPickupHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ConfirmPickupBody;
    res.json(await service.confirmPickup(req.params.id as string, body, req.user!));
}

export async function availableVehiclesHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listAvailableVehiclesForBooking(req.params.id as string));
}

export async function getBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getBookingById(req.params.id as string));
}

export async function approveBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.approveBooking(req.params.id as string, req.user!));
}

export async function rejectBookingHandler(req: AuthedRequest, res: Response) {
    const { reason } = req.body as RejectBookingBody;
    res.json(await service.rejectBooking(req.params.id as string, reason, req.user!));
}
