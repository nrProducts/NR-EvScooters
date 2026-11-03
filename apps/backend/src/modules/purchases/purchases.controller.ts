import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { badRequest } from "../../common/AppError";
import * as service from "./purchases.service";
import { PURCHASE_CATEGORIES } from "./purchases.itc";
import type { BillBody, ListBillsQuery, VendorBody } from "./purchases.validation";

const file = (req: AuthedRequest) => {
    const f = req.file as Express.Multer.File | undefined;
    if (!f) throw badRequest("Choose a file to upload.");
    return f;
};

export const categoriesHandler = (_req: AuthedRequest, res: Response) => { res.json(PURCHASE_CATEGORIES); };

export async function listVendorsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listVendors(validatedQuery<{ search?: string }>(req).search));
}
export async function createVendorHandler(req: AuthedRequest, res: Response) {
    res.status(201).json(await service.createVendor(req.body as VendorBody & { kind: string }, req.user!));
}
export async function updateVendorHandler(req: AuthedRequest, res: Response) {
    res.json(await service.updateVendor(req.params.id as string, req.body as VendorBody & { kind: string }, req.user!));
}

export async function listBillsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listBills(validatedQuery<ListBillsQuery>(req)));
}
export async function getBillHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getBill(req.params.id as string));
}
export async function createBillHandler(req: AuthedRequest, res: Response) {
    res.status(201).json(await service.createBill(req.body as BillBody, req.user!));
}
export async function updateBillHandler(req: AuthedRequest, res: Response) {
    res.json(await service.updateDraftBill(req.params.id as string, req.body as BillBody, req.user!));
}
export async function confirmBillHandler(req: AuthedRequest, res: Response) {
    res.json(await service.confirmBill(req.params.id as string, req.user!));
}
export async function cancelBillHandler(req: AuthedRequest, res: Response) {
    res.json(await service.cancelBill(req.params.id as string, (req.body as { reason: string }).reason, req.user!));
}
export async function uploadBillFileHandler(req: AuthedRequest, res: Response) {
    const f = file(req);
    res.json(await service.uploadBillFile(req.params.id as string, { buffer: f.buffer, size: f.size }, req.user!));
}
export async function billFileUrlHandler(req: AuthedRequest, res: Response) {
    res.json(await service.billFileUrl(req.params.id as string));
}
export async function paymentCandidatesHandler(req: AuthedRequest, res: Response) {
    res.json(await service.paymentCandidates(req.params.id as string));
}
export async function linkPaymentHandler(req: AuthedRequest, res: Response) {
    res.json(await service.linkPayment(req.params.id as string, (req.body as { bankLineId: string }).bankLineId, req.user!));
}
export async function unlinkPaymentHandler(req: AuthedRequest, res: Response) {
    res.json(await service.unlinkPayment(req.params.id as string, req.params.lineId as string, req.user!));
}
export async function payablesHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.listPayables());
}
export async function itcSummaryHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getItcSummary(validatedQuery<{ month: string }>(req).month));
}
export async function importGstr2bHandler(req: AuthedRequest, res: Response) {
    const f = file(req);
    const month = (req.body as { month?: string } | undefined)?.month;
    res.status(201).json(await service.importGstr2b(
        { buffer: f.buffer, originalname: f.originalname },
        month && /^\d{4}-\d{2}$/.test(month) ? month : null,
        req.user!,
    ));
}
export async function twoBNotInBooksHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listTwoBNotInBooks(validatedQuery<{ month: string }>(req).month));
}
export async function draftFromStatementsHandler(req: AuthedRequest, res: Response) {
    const { month } = req.body as { month?: string };
    if (!month) throw badRequest("Choose a month.");
    res.status(201).json(await service.draftBillsFromStatements(month, req.user!));
}
export async function assetsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.assetRegister(validatedQuery<{ rate: number }>(req).rate));
}
export async function vehicleCostHandler(req: AuthedRequest, res: Response) {
    await service.setVehicleCost(req.params.id as string, req.body as { billLineId: string | null; cost: number; purchasedOn?: string | null }, req.user!);
    res.status(204).end();
}
