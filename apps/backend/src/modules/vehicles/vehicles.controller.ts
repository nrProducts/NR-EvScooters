import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./vehicles.service";
import {
    CreateVehicleDocumentInput, CreateVehicleInput, ListVehiclesFilters, ScrapVehicleInput,
    UpdateVehicleDocumentInput, UpdateVehicleInput,
} from "./vehicles.types";
import type { UploadedFile } from "../kyc/kyc.storage";

export async function listVehiclesHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListVehiclesFilters>(req);
    const result = await service.listVehicles(filters);
    res.json(result);
}

export async function getVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.getVehicleById(req.params.id as string);
    res.json(vehicle);
}

export async function createVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.createVehicle(req.body as CreateVehicleInput, req.user!, req);
    res.status(201).json(vehicle);
}

export async function updateVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.updateVehicle(req.params.id as string, req.body as UpdateVehicleInput, req.user!, req);
    res.json(vehicle);
}

export async function assignVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.assignVehicle(req.params.id as string, req.user!.id! as string);
    res.json(vehicle);
}

export async function assignVehicleToUserHandler(req: AuthedRequest, res: Response) {
    const { user_id, unassign_existing } = req.body as { user_id: string; unassign_existing?: boolean };
    const { vehicle } = await service.assignVehicleToUser(req.params.id as string, user_id, req.user!, undefined, {
        unassignExisting: unassign_existing,
    });
    res.json(vehicle);
}

/*
 * uploadVehiclePhotoHandler / deleteVehiclePhotoHandler lived here.
 *
 * `vehicle_photos` is not in the new schema. The audit found the table held
 * zero rows and duplicated `vehicle_models.image`
 * (docs/database-audit/05-initial-problems.md), so model imagery is
 * `vehicle_model_media` and a photo of one unit's damage belongs to its
 * incident. There is nowhere left for a per-unit photo, so the endpoints are
 * gone rather than writing to a table that does not exist.
 */

export async function scrapVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.scrapVehicle(req.params.id as string, req.body as ScrapVehicleInput, req.user!);
    res.json(vehicle);
}

// --- vehicle documents (RC / insurance / PUC / fitness / permit) --------

function documentFile(req: AuthedRequest): UploadedFile | undefined {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return undefined;
    return { buffer: file.buffer, mimetype: file.mimetype, size: file.size, originalname: file.originalname };
}

export async function createVehicleDocumentHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateVehicleDocumentInput;
    const document = await service.createVehicleDocument(req.params.id as string, body, documentFile(req), req.user!);
    res.status(201).json(document);
}

export async function updateVehicleDocumentHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateVehicleDocumentInput;
    const document = await service.updateVehicleDocument(
        req.params.documentId as string, body, documentFile(req), req.user!,
    );
    res.json(document);
}

export async function deleteVehicleDocumentHandler(req: AuthedRequest, res: Response) {
    await service.deleteVehicleDocument(req.params.documentId as string, req.user!);
    res.status(204).send();
}

export async function vehicleDocumentUrlHandler(req: AuthedRequest, res: Response) {
    const url = await service.getVehicleDocumentUrl(req.params.documentId as string);
    res.json({ url });
}
