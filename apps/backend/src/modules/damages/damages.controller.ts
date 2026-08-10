import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { isStaff } from "../../middleware/authorize.middleware";
import * as service from "./damages.service";
import { DisputeDamageBody, ListDamagesQuery, ResolveDisputeBody } from "./damages.validation";

export async function listDamagesHandler(req: AuthedRequest, res: Response) {
    const { bookingId, status, ...page } = validatedQuery<ListDamagesQuery>(req);
    res.json(await service.listDamages({ ...page, bookingId, status }));
}

export async function getDamageHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getDamageForActor(req.params.id as string, req.user!, isStaff(req)));
}

/** Rider's own damage records for one of their own bookings. */
export async function myDamagesForBookingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listMyDamages(req.query.bookingId as string, req.user!));
}

export async function disputeDamageHandler(req: AuthedRequest, res: Response) {
    const body = req.body as DisputeDamageBody;
    res.json(await service.disputeDamage(req.params.id as string, body, req.user!));
}

export async function resolveDisputeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ResolveDisputeBody;
    res.json(await service.resolveDispute(req.params.id as string, body, req.user!));
}
