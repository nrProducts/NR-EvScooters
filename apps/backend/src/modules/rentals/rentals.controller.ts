import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./rentals.service";

export async function myCurrentRentalHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentRental(req.user!.id));
}
