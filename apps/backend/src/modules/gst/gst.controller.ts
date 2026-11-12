import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { notFound } from "../../common/AppError";
import * as service from "./gst.service";
import * as returns from "./gst.returns";
import type {
    CreateGstProfileBody, ExportQuery, ListTaxDocumentsQuery, MyDocumentsQuery, ReturnStatusBody, SummaryQuery,
} from "./gst.validation";

function sendFile(res: Response, file: { filename: string; contentType: string; body: Buffer }, inline = false) {
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    // The browser fetch() can only read this header cross-origin if it's exposed.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.body);
}

// --- admin -----------------------------------------------------------------

export async function listDocumentsHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<ListTaxDocumentsQuery>(req);
    res.json(await service.listTaxDocuments(q));
}

export async function summaryHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<SummaryQuery>(req);
    res.json(await service.getTaxDocumentSummary(q.from, q.to));
}

export async function getDocumentHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getTaxDocument(req.params.id as string));
}

export async function documentPdfHandler(req: AuthedRequest, res: Response) {
    const pdf = await service.buildTaxDocumentPdf(req.params.id as string);
    sendFile(res, { ...pdf, contentType: "application/pdf" });
}

export async function exportRegisterHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<ExportQuery>(req);
    sendFile(res, await service.buildRegisterExport(q.from, q.to, q.format));
}

export async function exportPdfZipHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<SummaryQuery>(req);
    const zip = await service.buildPdfZip(q.from, q.to);
    sendFile(res, { ...zip, contentType: "application/zip" });
}

export async function pendingHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getPendingTaxDocuments());
}

export async function issuePendingHandler(req: AuthedRequest, res: Response) {
    res.json(await service.issuePendingTaxDocuments(req.user!));
}

export async function listProfilesHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.listGstProfiles());
}

export async function createProfileHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateGstProfileBody;
    res.status(201).json(await service.createGstProfile(body, req.user!));
}

// --- rider -----------------------------------------------------------------

export async function myDocumentsHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<MyDocumentsQuery>(req);
    res.json(await service.listMyTaxDocuments(req.user!.id, q));
}

export async function myDocumentLinkHandler(req: AuthedRequest, res: Response) {
    res.json(await service.createMyDocumentLink(req.user!.id, req.params.id as string));
}

export async function myDocumentPdfHandler(req: AuthedRequest, res: Response) {
    const pdf = await service.buildTaxDocumentPdf(req.params.id as string, req.user!.id);
    sendFile(res, { ...pdf, contentType: "application/pdf" });
}

// --- public (signed link) ------------------------------------------------------

export async function publicDocumentPdfHandler(req: AuthedRequest, res: Response) {
    const token = String(req.params.token ?? "");
    const claim = service.verifyDocumentLinkToken(token);
    // One answer for expired, forged and unknown alike.
    if (!claim) throw notFound("This link has expired. Open the invoice again from the app.");
    const pdf = await service.buildTaxDocumentPdf(claim.docId, claim.userId);
    sendFile(res, { ...pdf, contentType: "application/pdf" }, true);
}

// --- returns (Stage 5) -----------------------------------------------------------

export async function listReturnsHandler(_req: AuthedRequest, res: Response) {
    res.json(await returns.listReturnPeriods());
}

export async function worksheetHandler(req: AuthedRequest, res: Response) {
    res.json(await returns.buildWorksheet(req.params.month as string));
}

export async function worksheetXlsxHandler(req: AuthedRequest, res: Response) {
    sendFile(res, await returns.buildWorksheetXlsx(req.params.month as string));
}

export async function gstr1JsonHandler(req: AuthedRequest, res: Response) {
    const month = req.params.month as string;
    const ws = await returns.buildWorksheet(month);
    sendFile(res, {
        filename: `swapngo-gstr1_${month}.json`,
        contentType: "application/json",
        body: Buffer.from(JSON.stringify(returns.gstr1Json(ws), null, 2)),
    });
}

export async function packHandler(req: AuthedRequest, res: Response) {
    sendFile(res, await returns.buildAuditorPack(req.params.month as string, req.user!));
}

export async function returnStatusHandler(req: AuthedRequest, res: Response) {
    res.json(await returns.updateReturnStatus(req.params.month as string, req.body as ReturnStatusBody, req.user!));
}
