import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { isStaff } from "../../middleware/authorize.middleware";
import { badRequest } from "../../common/AppError";
import { KycDocType } from "../../types";
import { UploadedFile } from "./kyc.storage";
import * as service from "./kyc.service";
import { logPiiAccess, type PiiAccessReason } from "../../common/piiAccess";

type MulterFiles = Record<string, Express.Multer.File[]> | undefined;

function fileFrom(req: AuthedRequest, field: string): UploadedFile | undefined {
    const files = req.files as MulterFiles;
    const found = files?.[field]?.[0];
    if (!found) return undefined;
    return {
        buffer: found.buffer,
        mimetype: found.mimetype,
        size: found.size,
        originalname: found.originalname,
    };
}

// --- rider ---------------------------------------------------------------

export async function getMyKycHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getKycForUser(req.user!.id));
}

export async function uploadMyDocumentHandler(req: AuthedRequest, res: Response) {
    const front = fileFrom(req, "front");
    if (!front) throw badRequest("A front image or PDF is required.", { front: "Attach the document." });

    // The API keeps its own field names; the service maps them onto
    // document_type / expires_on.
    const body = req.body as { document_type: KycDocType; doc_number: string; expires_on?: string };
    const document = await service.uploadDocument(
        req.user!.id,
        { ...body, front, back: fileFrom(req, "back") },
        req.user!,
        req,
    );
    res.status(201).json(document);
}

export async function updateMyDocumentHandler(req: AuthedRequest, res: Response) {
    const document = await service.updateOwnDocument(
        req.user!.id,
        req.params.documentId as string,
        { ...req.body, front: fileFrom(req, "front"), back: fileFrom(req, "back") },
        req.user!,
        req,
    );
    res.json(document);
}

export async function deleteMyDocumentHandler(req: AuthedRequest, res: Response) {
    await service.deleteOwnDocument(req.user!.id, req.params.documentId as string, req.user!, req);
    res.status(204).send();
}

export async function submitMyKycHandler(req: AuthedRequest, res: Response) {
    res.json(await service.submitKyc(req.user!.id, req.user!, req));
}

// --- shared --------------------------------------------------------------

export async function documentUrlHandler(req: AuthedRequest, res: Response) {
    const { side, reason, context_ref } = validatedQuery<{
        side: "front" | "back";
        reason?: PiiAccessReason;
        context_ref?: string;
    }>(req);

    const documentId = req.params.documentId as string;
    const result = await service.getDocumentSignedUrl(documentId, side, req.user!, isStaff(req));

    // Logged AFTER the service call, so a refused request is not recorded as
    // an access that happened. logPiiAccess skips self-access, which is what
    // makes it safe to call on this shared rider/admin handler.
    await logPiiAccess({
        actor: req.user!,
        targetUserId: result.user_id,
        resource: "kyc_document_image",
        resourceId: documentId,
        fields: [`${result.document_type}_${side}_image`],
        reason: reason ?? (isStaff(req) ? "kyc_review" : "rider_self"),
        contextRef: context_ref,
        req,
    });

    res.json({ url: result.url, expires_in: result.expires_in });
}

// --- admin/staff ---------------------------------------------------------

export async function listKycHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listKycQueue(validatedQuery<service.KycListFilters>(req)));
}

export async function getKycDetailHandler(req: AuthedRequest, res: Response) {
    const userId = req.params.userId as string;
    const detail = await service.getKycDetail(userId);

    // The detail view returns date of birth and full address alongside the
    // document list — more personal data in one response than anything else
    // in the console.
    await logPiiAccess({
        actor: req.user!,
        targetUserId: userId,
        resource: "kyc_detail",
        resourceId: userId,
        fields: ["full_name", "date_of_birth", "address", "phone", "email", "documents"],
        reason: "kyc_review",
        req,
    });

    res.json(detail);
}

export async function verifyDocumentHandler(req: AuthedRequest, res: Response) {
    res.json(await service.verifyDocument(req.params.documentId as string, req.user!, req));
}

export async function rejectDocumentHandler(req: AuthedRequest, res: Response) {
    const { reason } = req.body as { reason: string };
    res.json(await service.rejectDocument(req.params.documentId as string, reason, req.user!, req));
}

export async function approveKycHandler(req: AuthedRequest, res: Response) {
    res.json(await service.approveKyc(req.params.userId as string, req.user!, req));
}

export async function rejectKycHandler(req: AuthedRequest, res: Response) {
    const { reason } = req.body as { reason: string };
    res.json(await service.rejectKyc(req.params.userId as string, reason, req.user!, req));
}
