import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./books.service";
import type { RangeQuery } from "./books.validation";

function sendFile(res: Response, file: { filename: string; contentType: string; body: Buffer }) {
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.body);
}

export async function trialBalanceHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RangeQuery>(req);
    res.json(await service.getTrialBalance(q.from, q.to));
}

export async function profitAndLossHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RangeQuery>(req);
    res.json(await service.getProfitAndLoss(q.from, q.to));
}

export async function depositRegisterHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getDepositRegister());
}

export async function receivablesHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getReceivables());
}

export async function advanceTaxHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getAdvanceTax());
}

export async function unbalancedHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.listUnbalanced());
}

export async function tallyExportHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RangeQuery>(req);
    sendFile(res, await service.buildTallyExport(q.from, q.to, req.user!));
}

export async function booksXlsxHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RangeQuery>(req);
    sendFile(res, await service.buildBooksXlsx(q.from, q.to, req.user!));
}
