import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./reconciliation.service";
import * as statements from "./statements.service";
import * as bank from "./bank.service";
import { badRequest } from "../../common/AppError";
import type {
    BankLinesQuery, CategoriseBody, ListExceptionsQuery, ListStatementsQuery, MonthQuery, ReconciliationQuery,
    ResolveExceptionBody, SyncBody,
} from "./reconciliation.validation";

export async function getReconciliationHandler(req: AuthedRequest, res: Response) {
    const { from, to } = validatedQuery<ReconciliationQuery>(req);
    res.json(await service.getReconciliationReport({ from, to }));
}

export function sendFile(res: Response, file: { filename: string; contentType: string; body: Buffer }) {
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.body);
}

export async function listStatementsHandler(req: AuthedRequest, res: Response) {
    res.json(await statements.listStatements(validatedQuery<ListStatementsQuery>(req)));
}

export async function getStatementHandler(req: AuthedRequest, res: Response) {
    res.json(await statements.getStatement(req.params.id as string));
}

export async function settlementSummaryHandler(req: AuthedRequest, res: Response) {
    res.json(await statements.getSettlementMonthSummary(validatedQuery<MonthQuery>(req).month));
}

export async function settlementExportHandler(req: AuthedRequest, res: Response) {
    sendFile(res, await statements.buildSettlementExport(validatedQuery<MonthQuery>(req).month));
}

export async function listExceptionsHandler(req: AuthedRequest, res: Response) {
    res.json(await statements.listExceptions(validatedQuery<ListExceptionsQuery>(req)));
}

export async function resolveExceptionHandler(req: AuthedRequest, res: Response) {
    res.json(await statements.resolveException(req.params.id as string, req.body as ResolveExceptionBody, req.user!));
}

export async function recoverPaymentHandler(req: AuthedRequest, res: Response) {
    res.json(await statements.recoverPayment(req.params.id as string, req.user!));
}

export async function syncSettlementsHandler(req: AuthedRequest, res: Response) {
    const result = await statements.syncRazorpaySettlements(req.body as SyncBody, req.user!);
    // A bank credit imported before its settlement was synced (B2) clears now.
    const bankRematch = await bank.rematchOpenBankLines();
    res.json({ ...result, bankRematch });
}

// --- Stage 3: HDFC ------------------------------------------------------------------

function uploadedStatement(req: AuthedRequest): bank.UploadedStatement {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw badRequest("Choose the HDFC statement file to upload.");
    return { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype };
}

export async function previewBankHandler(req: AuthedRequest, res: Response) {
    res.json(await bank.previewBankStatement(uploadedStatement(req)));
}

export async function importBankHandler(req: AuthedRequest, res: Response) {
    const confirmNewAccount = String((req.body as Record<string, unknown> | undefined)?.confirmNewAccount ?? "") === "true";
    res.status(201).json(await bank.importBankStatement(uploadedStatement(req), { confirmNewAccount }, req.user!));
}

export async function listBankLinesHandler(req: AuthedRequest, res: Response) {
    res.json(await bank.listBankLines(validatedQuery<BankLinesQuery>(req)));
}

export async function categoriseLineHandler(req: AuthedRequest, res: Response) {
    res.json(await bank.categoriseLine(req.params.id as string, req.body as CategoriseBody, req.user!));
}

export async function rematchBankHandler(_req: AuthedRequest, res: Response) {
    res.json(await bank.rematchOpenBankLines());
}

export async function cashBookHandler(req: AuthedRequest, res: Response) {
    res.json(await bank.getCashBook(validatedQuery<MonthQuery>(req).month));
}

export async function tieOutHandler(req: AuthedRequest, res: Response) {
    res.json(await bank.getTieOut(validatedQuery<MonthQuery>(req).month));
}
