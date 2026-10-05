import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./attendance.service";
import { ListAttendanceFilters, MyAttendanceHistoryFilters } from "./attendance.types";

export async function checkInHandler(req: AuthedRequest, res: Response) {
    const record = await service.checkIn(req.user!.id);
    res.status(201).json(record);
}

export async function checkOutHandler(req: AuthedRequest, res: Response) {
    const record = await service.checkOut(req.user!.id);
    res.json(record);
}

export async function myTodayHandler(req: AuthedRequest, res: Response) {
    const record = await service.getMyToday(req.user!.id);
    res.json(record);
}

export async function myHistoryHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<MyAttendanceHistoryFilters>(req);
    const result = await service.getMyHistory(req.user!.id, filters);
    res.json(result);
}

export async function todayRosterHandler(_req: AuthedRequest, res: Response) {
    const roster = await service.getTodayRoster();
    res.json(roster);
}

export async function listAttendanceHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListAttendanceFilters>(req);
    const result = await service.listAttendance(filters);
    res.json(result);
}
