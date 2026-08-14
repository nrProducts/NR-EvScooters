import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { badRequest } from "../../common/AppError";
import * as service from "./vehicles.service";
import { assertValidVehiclePhoto } from "./vehicles.photo.storage";
import { CreateVehicleInput, ListVehiclesFilters, ScrapVehicleInput, UpdateVehicleInput } from "./vehicles.types";

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

export async function uploadVehiclePhotoHandler(req: AuthedRequest, res: Response) {
    const file = req.file;
    if (!file) throw badRequest("A photo is required.", { photo: "Attach a photo." });

    const mime = assertValidVehiclePhoto({
        buffer: file.buffer,
        mimetype: file.mimetype,
        size: file.size,
        originalname: file.originalname,
    });
    const isPrimary = req.body?.is_primary === "true" || req.body?.is_primary === true;

    const photo = await service.uploadVehiclePhoto(
        req.params.id as string,
        { buffer: file.buffer, mimetype: file.mimetype, size: file.size, originalname: file.originalname },
        mime,
        isPrimary,
    );
    res.status(201).json(photo);
}

export async function deleteVehiclePhotoHandler(req: AuthedRequest, res: Response) {
    await service.deleteVehiclePhoto(req.params.id as string, req.params.photoId as string);
    res.status(204).send();
}

export async function scrapVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.scrapVehicle(req.params.id as string, req.body as ScrapVehicleInput, req.user!);
    res.json(vehicle);
}
