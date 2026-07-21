import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { badRequest, tooLarge } from "../../common/AppError";
import { KycDocType } from "../../types";

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

const EXTENSION_FOR_MIME: Record<AllowedMime, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
};

/**
 * Magic-number check. The client-supplied mimetype is a hint, not evidence —
 * a renamed .exe will happily claim image/png, so the bytes are inspected
 * before anything reaches the bucket.
 */
const SIGNATURES: Array<{ mime: AllowedMime; bytes: number[]; offset: number }> = [
    { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], offset: 0 },
    { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
    { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], offset: 0 },
];

export function detectMime(buffer: Buffer): AllowedMime | null {
    for (const sig of SIGNATURES) {
        const slice = buffer.subarray(sig.offset, sig.offset + sig.bytes.length);
        if (slice.length === sig.bytes.length && sig.bytes.every((b, i) => slice[i] === b)) {
            return sig.mime;
        }
    }
    return null;
}

export interface UploadedFile {
    buffer: Buffer;
    mimetype: string;
    size: number;
    originalname: string;
}

export function assertValidFile(file: UploadedFile, field: string): AllowedMime {
    if (file.size > env.kycMaxFileBytes) {
        throw tooLarge(
            `${field} must be ${Math.floor(env.kycMaxFileBytes / (1024 * 1024))} MB or smaller.`,
        );
    }
    if (file.size === 0) throw badRequest("The uploaded file is empty.", { [field]: "The file is empty." });

    const actual = detectMime(file.buffer);
    if (!actual) {
        throw badRequest("Only JPEG, PNG or PDF files are accepted.", {
            [field]: "Only JPEG, PNG or PDF files are accepted.",
        });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as AllowedMime) || actual !== file.mimetype) {
        // Trust the bytes, reject the mismatch rather than silently correcting.
        throw badRequest("The file content does not match its declared type.", {
            [field]: "The file content does not match its declared type.",
        });
    }
    return actual;
}

/** {userId}/{documentType}/{generatedFileName} — never client-controlled. */
export function buildStoragePath(userId: string, docType: KycDocType, mime: AllowedMime, side: "front" | "back"): string {
    return `${userId}/${docType}/${side}-${randomUUID()}.${EXTENSION_FOR_MIME[mime]}`;
}

export async function uploadKycFile(path: string, file: UploadedFile, mime: AllowedMime): Promise<string> {
    const { error } = await supabaseAdmin.storage.from(env.kycBucket).upload(path, file.buffer, {
        contentType: mime,
        upsert: false,
    });
    if (error) throw error;
    return path;
}

export async function removeKycFiles(paths: Array<string | null | undefined>): Promise<void> {
    const real = paths.filter((p): p is string => !!p);
    if (real.length === 0) return;
    const { error } = await supabaseAdmin.storage.from(env.kycBucket).remove(real);
    if (error) {
        // An orphaned object is a storage-cost problem, not a correctness one:
        // the DB row is already gone, so never fail the request over it.
        console.error("[kyc.storage] failed to remove objects", { paths: real.length, error: error.message });
    }
}

/**
 * The only way bytes leave the private bucket. Short-lived and minted per
 * request for an already-authorised caller — never persisted or cached.
 */
export async function createSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
        .from(env.kycBucket)
        .createSignedUrl(path, env.kycSignedUrlTtlSeconds);
    if (error || !data) throw error ?? new Error("Could not create signed URL");
    return data.signedUrl;
}

/** Ownership check: the path must sit under the user's own prefix. */
export function pathBelongsToUser(path: string, userId: string): boolean {
    return path.startsWith(`${userId}/`);
}
