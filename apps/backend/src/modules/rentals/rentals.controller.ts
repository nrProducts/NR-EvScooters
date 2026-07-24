import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./rentals.service";
import { RentalHistoryQuery } from "./rentals.validation";

export async function myCurrentRentalHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentRental(req.user!.id));
}

export async function myRentalHistoryHandler(req: AuthedRequest, res: Response) {
    const page = validatedQuery<RentalHistoryQuery>(req);
    res.json(await service.getMyRentalHistory(req.user!.id, page));
}
