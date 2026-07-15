import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { assignVehicle } from "./vehicles.service";

export async function assignVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await assignVehicle(req.params.id as string, req.user!.id! as string);
    res.json(vehicle);
}