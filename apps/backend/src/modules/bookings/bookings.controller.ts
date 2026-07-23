import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./bookings.service";
import { ConfirmPickupBody, CreateBookingBody, PickupQueueQuery } from "./bookings.validation";

export async function createBookingHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateBookingBody;
    const booking = await service.createBooking(body, req.user!);
    res.status(201).json(booking);
}

export async function myCurrentBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentBooking(req.user!.id));
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
