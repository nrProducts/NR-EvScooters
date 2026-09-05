import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./legal.service";
import type { LegalDocumentType, LegalLanguage } from "./legal.types";
import type { AcceptDocumentBody, PublishDocumentBody } from "./legal.validation";

/** GET /legal/documents/:type?lang=en|ta — the live document, for reading. */
export async function getDocumentHandler(req: AuthedRequest, res: Response) {
    const { lang } = validatedQuery<{ lang: LegalLanguage }>(req);
    const type = req.params.type as LegalDocumentType;
    res.json(await service.getDocumentView(type, lang));
}

/** GET /legal/documents/:type/versions — admin history of published versions. */
export async function listDocumentsHandler(req: AuthedRequest, res: Response) {
    const type = req.params.type as LegalDocumentType;
    res.json({ data: await service.listDocuments(type) });
}

/** POST /legal/documents — publishes a new version and retires the live one. */
export async function publishDocumentHandler(req: AuthedRequest, res: Response) {
    const body = req.body as PublishDocumentBody;
    res.status(201).json(await service.publishDocument(body, req.user!, req));
}

/** GET /users/me/legal/terms — whether the rider owes an acceptance. */
export async function getMyTermsStateHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getAcceptanceState(req.user!.id, "terms"));
}

/** GET /users/me/legal/acceptances — the rider's own acceptance trail. */
export async function getMyAcceptanceHistoryHandler(req: AuthedRequest, res: Response) {
    res.json({ data: await service.getAcceptanceHistory(req.user!.id) });
}

/** POST /users/me/legal/acceptances — records acceptance of the live document. */
export async function acceptDocumentHandler(req: AuthedRequest, res: Response) {
    const body = req.body as AcceptDocumentBody;
    res.status(201).json(
        await service.acceptDocument(req.user!.id, body, {
            source: "mobile",
            actorId: null, // the rider acted for themselves
        }, req),
    );
}
