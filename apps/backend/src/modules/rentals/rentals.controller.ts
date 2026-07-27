import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./rentals.service";
import { ListRentalsFilters } from "./rentals.types";
import { CompleteRideBody, MoveToMaintenanceBody, RentalHistoryQuery } from "./rentals.validation";

export async function myCurrentRentalHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentRental(req.user!.id));
}

export async function myRentalHistoryHandler(req: AuthedRequest, res: Response) {
    const page = validatedQuery<RentalHistoryQuery>(req);
    res.json(await service.getMyRentalHistory(req.user!.id, page));
}

export async function listRentalsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListRentalsFilters>(req);
    res.json(await service.listRentals(filters));
}

export async function getRentalHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getRentalById(req.params.id as string));
}

export async function completeRideHandler(req: AuthedRequest, res: Response) {
    const rental = await service.completeRide(req.params.id as string, req.body as CompleteRideBody, req.user!);
    res.json(rental);
}

export async function moveToMaintenanceHandler(req: AuthedRequest, res: Response) {
    const rental = await service.moveRideToMaintenance(
        req.params.id as string,
        req.body as MoveToMaintenanceBody,
        req.user!,
    );
    res.json(rental);
}
