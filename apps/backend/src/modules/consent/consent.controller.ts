import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./consent.service";
import { logPiiAccess } from "../../common/piiAccess";
import type { ConsentLanguage, ConsentPurpose } from "./consent.types";
import type { PublishNoticeBody, RecordConsentBody } from "./consent.validation";

/** GET /consent/notice?lang=en|ta — the live notice, in the rider's language. */
export async function getNoticeHandler(req: AuthedRequest, res: Response) {
    const { lang } = validatedQuery<{ lang: ConsentLanguage }>(req);
    res.json(await service.getNoticeView(lang));
}

/** GET /users/me/consents — current state plus whether re-consent is due. */
export async function getMyConsentsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getConsentState(req.user!.id));
}

/** POST /users/me/consents — records the rider's choices for the live notice. */
export async function recordMyConsentsHandler(req: AuthedRequest, res: Response) {
    const body = req.body as RecordConsentBody;
    res.json(
        await service.recordConsents(req.user!.id, body, {
            source: "mobile",
            actorId: null, // the rider acted for themselves
            req,
        }),
    );
}

/** DELETE /users/me/consents/:purpose — the withdrawal toggle. */
export async function withdrawMyConsentHandler(req: AuthedRequest, res: Response) {
    const purpose = req.params.purpose as ConsentPurpose;
    res.json(
        await service.withdrawConsent(req.user!.id, purpose, {
            source: "mobile",
            actorId: null,
            req,
        }),
    );
}

/** GET /users/me/consents/history — the rider's own audit trail of decisions. */
export async function getMyConsentHistoryHandler(req: AuthedRequest, res: Response) {
    res.json({ data: await service.getConsentHistory(req.user!.id) });
}

/** GET /consent/users/:userId — staff view of a rider's consent state + history. */
export async function getUserConsentsHandler(req: AuthedRequest, res: Response) {
    const userId = req.params.userId as string;
    const [state, history] = await Promise.all([
        service.getConsentState(userId),
        service.getConsentHistory(userId),
    ]);

    await logPiiAccess({
        actor: req.user!,
        targetUserId: userId,
        resource: "consent_history",
        resourceId: userId,
        fields: ["consent_records"],
        req,
    });

    res.json({ ...state, history });
}

/** GET /consent/notices — admin: every published version. */
export async function listNoticesHandler(_req: AuthedRequest, res: Response) {
    res.json({ data: await service.listNotices() });
}

/** POST /consent/notices — admin: publish a revision and re-prompt every rider. */
export async function publishNoticeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as PublishNoticeBody;
    res.status(201).json(await service.publishNotice(body, req.user!, req));
}
