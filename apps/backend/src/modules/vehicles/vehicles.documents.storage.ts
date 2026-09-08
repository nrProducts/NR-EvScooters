import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { badRequest, tooLarge } from "../../common/AppError";
import { detectMime, type AllowedMime, type UploadedFile } from "../kyc/kyc.storage";

const EXTENSION_FOR_MIME: Record<AllowedMime, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
};

/** Same magic-number check as KYC uploads — the client's declared mimetype is a hint, not evidence. */
export function assertValidVehicleDocumentFile(file: UploadedFile): AllowedMime {
    if (file.size > env.vehicleDocumentMaxFileBytes) {
        throw tooLarge(
            `The file must be ${Math.floor(env.vehicleDocumentMaxFileBytes / (1024 * 1024))} MB or smaller.`,
        );
    }
    if (file.size === 0) throw badRequest("The uploaded file is empty.", { file: "The file is empty." });

    const actual = detectMime(file.buffer);
    if (!actual) {
        throw badRequest("Only JPEG, PNG or PDF files are accepted.", {
            file: "Only JPEG, PNG or PDF files are accepted.",
        });
    }
    return actual;
}

/** {vehicleId}/{documentType}/{generatedFileName} — never client-controlled. */
export function buildVehicleDocumentStoragePath(vehicleId: string, docType: string, mime: AllowedMime): string {
    return `${vehicleId}/${docType}/${randomUUID()}.${EXTENSION_FOR_MIME[mime]}`;
}

export async function uploadVehicleDocumentFile(path: string, file: UploadedFile, mime: AllowedMime): Promise<string> {
    const { error } = await supabaseAdmin.storage.from(env.vehicleDocumentBucket).upload(path, file.buffer, {
        contentType: mime,
        upsert: false,
    });
    if (error) throw error;
    return path;
}

export async function removeVehicleDocumentFile(path: string | null | undefined): Promise<void> {
    if (!path) return;
    const { error } = await supabaseAdmin.storage.from(env.vehicleDocumentBucket).remove([path]);
    if (error) {
        // An orphaned object is a storage-cost problem, not a correctness one:
        // the DB row is already gone (or about to be replaced), so never fail
        // the request over it.
        console.error("[vehicles.documents.storage] failed to remove object", { path, error: error.message });
    }
}

/** The only way document bytes leave the private bucket. Short-lived and minted per request. */
export async function createVehicleDocumentSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
        .from(env.vehicleDocumentBucket)
        .createSignedUrl(path, env.vehicleDocumentSignedUrlTtlSeconds);
    if (error || !data) throw error ?? new Error("Could not create signed URL");
    return data.signedUrl;
}
