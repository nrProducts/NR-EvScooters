import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./leave.service";
import { ApplyLeaveInput, ListLeaveFilters, MyLeaveFilters, PreviewLeaveInput, ReviewLeaveInput } from "./leave.types";

export async function listTypesHandler(_req: AuthedRequest, res: Response) {
    const types = await service.listLeaveTypes();
    res.json(types);
}

export async function myBalanceHandler(req: AuthedRequest, res: Response) {
    const balance = await service.getMyBalance(req.user!.id);
    res.json(balance);
}

export async function myRequestsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<MyLeaveFilters>(req);
    const result = await service.getMyLeaveRequests(req.user!.id, filters);
    res.json(result);
}

export async function previewHandler(req: AuthedRequest, res: Response) {
    const { start_date, end_date } = validatedQuery<PreviewLeaveInput>(req);
    const preview = await service.previewMyLeave(req.user!.id, start_date, end_date);
    res.json(preview);
}

export async function applyHandler(req: AuthedRequest, res: Response) {
    const request = await service.applyForLeave(req.user!.id, req.body as ApplyLeaveInput);
    res.status(201).json(request);
}

export async function cancelHandler(req: AuthedRequest, res: Response) {
    const request = await service.cancelMyLeaveRequest(req.user!.id, req.params.id as string);
    res.json(request);
}

export async function listHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListLeaveFilters>(req);
    const result = await service.listLeaveRequests(filters);
    res.json(result);
}

export async function approveHandler(req: AuthedRequest, res: Response) {
    const { review_note } = req.body as ReviewLeaveInput;
    const request = await service.approveLeaveRequest(req.params.id as string, req.user!, review_note);
    res.json(request);
}

export async function rejectHandler(req: AuthedRequest, res: Response) {
    const { review_note } = req.body as Required<ReviewLeaveInput>;
    const request = await service.rejectLeaveRequest(req.params.id as string, req.user!, review_note);
    res.json(request);
}
