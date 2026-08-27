import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./rentals.service";
import { ListRentalsFilters } from "./rentals.types";
import {
    CompleteRideBody, MoveToMaintenanceBody, RejectReturnBody, RentalHistoryQuery, RequestReturnBody,
} from "./rentals.validation";
import * as damagesService from "../damages/damages.service";
import { assertValidDamagePhoto, buildDamagePhotoPath, uploadDamagePhotoFile } from "../damages/damages.photo.storage";
import { RecordDamageBody } from "../damages/damages.validation";
import type { UploadedFile } from "../kyc/kyc.storage";
import { getMyReturnStage, getMySettlement, getMySettlementHistory } from "../returns/returns.service";

export async function myCurrentRentalHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyCurrentRental(req.user!.id));
}

export async function myRentalHistoryHandler(req: AuthedRequest, res: Response) {
    const page = validatedQuery<RentalHistoryQuery>(req);
    res.json(await service.getMyRentalHistory(req.user!.id, page));
}

export async function mySettlementHandler(req: AuthedRequest, res: Response) {
    res.json(await getMySettlement(req.user!.id));
}

export async function mySettlementHistoryHandler(req: AuthedRequest, res: Response) {
    const page = validatedQuery<RentalHistoryQuery>(req);
    res.json(await getMySettlementHistory(req.user!.id, page));
}

export async function myReturnStageHandler(req: AuthedRequest, res: Response) {
    res.json(await getMyReturnStage(req.user!.id));
}

export async function myOverdueLateFeeHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyOverdueLateFee(req.user!.id));
}

export async function payMyOverdueLateFeeHandler(req: AuthedRequest, res: Response) {
    res.json(await service.payMyOverdueLateFee(req.user!.id));
}

export async function requestReturnHandler(req: AuthedRequest, res: Response) {
    const body = req.body as RequestReturnBody;
    res.json(await service.requestReturn(req.params.id as string, body, req.user!));
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

export async function rejectReturnHandler(req: AuthedRequest, res: Response) {
    const rental = await service.rejectReturn(req.params.id as string, req.body as RejectReturnBody, req.user!);
    res.json(rental);
}

/**
 * Staff return-inspection damage entry — a separate, explicit action
 * alongside POST /:id/complete or /:id/maintenance (which staff still call
 * to close the physical ride out), so a no-damage return never touches this.
 */
export async function returnInspectionHandler(req: AuthedRequest, res: Response) {
    const body = req.body as RecordDamageBody;
    const files = ((req.files as Express.Multer.File[] | undefined) ?? []);

    const paths: string[] = [];
    for (const file of files) {
        const uploaded: UploadedFile = {
            buffer: file.buffer, mimetype: file.mimetype, size: file.size, originalname: file.originalname,
        };
        const mime = assertValidDamagePhoto(uploaded);
        const path = buildDamagePhotoPath(req.params.id as string, mime);
        await uploadDamagePhotoFile(path, uploaded, mime);
        paths.push(path);
    }

    const damage = await damagesService.recordDamage(req.params.id as string, body, paths, req.user!);
    res.status(201).json(damage);
}
