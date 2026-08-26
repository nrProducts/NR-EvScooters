import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./returns.service";
import type { ApproveReturnSettlementBody, ListSettlementsQuery, SaveInspectionBody } from "./returns.validation";
import * as damagesService from "../damages/damages.service";
import { assertValidDamagePhoto, buildDamagePhotoPath, uploadDamagePhotoFile } from "../damages/damages.photo.storage";
import { recordDamageBody, type RecordDamageBody } from "../damages/damages.validation";
import type { UploadedFile } from "../kyc/kyc.storage";

export async function getReturnDetailHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getReturnDetail(req.params.id as string));
}

/**
 * Add one damage charge to a return in progress — a separate, immediate
 * action rather than part of the final "Save Inspection" submit, so it can
 * carry photos through the same multer/Supabase-Storage pipeline
 * rentals.controller.ts's returnInspectionHandler already uses, and so it
 * shows up as its own card the moment it's added.
 */
export async function addReturnDamageHandler(req: AuthedRequest, res: Response) {
    const body: RecordDamageBody = recordDamageBody.parse(req.body);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const paths: string[] = [];
    for (const file of files) {
        const uploaded: UploadedFile = {
            buffer: file.buffer, mimetype: file.mimetype, size: file.size, originalname: file.originalname,
        };
        const mime = assertValidDamagePhoto(uploaded);
        const path = buildDamagePhotoPath(req.params.id as string, mime);
        await uploadDamagePhotoFile(path, uploaded, mime);
        paths.push(path);
    }

    await damagesService.recordDamage(req.params.id as string, body, paths, req.user!, { skipInvoice: true });
    res.status(201).json(await service.getReturnDetail(req.params.id as string));
}

/** Remove-only: waives a mistakenly-added damage charge. Fix a wrong one by removing it and adding a corrected one. */
export async function removeReturnDamageHandler(req: AuthedRequest, res: Response) {
    await damagesService.waiveDamage(req.params.damageId as string, req.user!);
    res.json(await service.getReturnDetail(req.params.id as string));
}

export async function saveInspectionHandler(req: AuthedRequest, res: Response) {
    const body = req.body as SaveInspectionBody;
    res.json(await service.saveInspection(req.params.id as string, body, req.user!));
}

export async function getPaymentReviewHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getPaymentReview(req.params.id as string));
}

export async function verifyReturnPaymentHandler(req: AuthedRequest, res: Response) {
    res.json(await service.verifyReturnPayment(req.params.id as string, req.user!));
}

export async function approveReturnSettlementHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ApproveReturnSettlementBody;
    res.json(await service.approveReturnSettlement(req.params.id as string, body, req.user!));
}

export async function listSettlementsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listSettlements(validatedQuery<ListSettlementsQuery>(req)));
}
