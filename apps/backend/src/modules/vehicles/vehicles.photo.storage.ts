import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { badRequest, tooLarge } from "../../common/AppError";
import { detectMime, UploadedFile, type AllowedMime } from "../kyc/kyc.storage";

/** Vehicle photos are images only, same as profile photos. */
type PhotoMime = "image/jpeg" | "image/png";
const ALLOWED_PHOTO_MIME_TYPES: readonly PhotoMime[] = ["image/jpeg", "image/png"];

const EXTENSION_FOR_MIME: Record<PhotoMime, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
};

function isPhotoMime(mime: AllowedMime): mime is PhotoMime {
    return (ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(mime);
}

export function assertValidVehiclePhoto(file: UploadedFile): PhotoMime {
    if (file.size > env.vehiclePhotoMaxFileBytes) {
        throw tooLarge(`Photo must be ${Math.floor(env.vehiclePhotoMaxFileBytes / (1024 * 1024))} MB or smaller.`);
    }
    if (file.size === 0) throw badRequest("The uploaded photo is empty.", { photo: "The file is empty." });

    const actual = detectMime(file.buffer);
    if (!actual || !isPhotoMime(actual)) {
        throw badRequest("Only JPEG or PNG photos are accepted.", { photo: "Only JPEG or PNG photos are accepted." });
    }
    if (actual !== file.mimetype) {
        throw badRequest("The file content does not match its declared type.", {
            photo: "The file content does not match its declared type.",
        });
    }
    return actual;
}

/** {vehicleId}/{generatedFileName} — never client-controlled. */
export function buildVehiclePhotoPath(vehicleId: string, mime: PhotoMime): string {
    return `${vehicleId}/${randomUUID()}.${EXTENSION_FOR_MIME[mime]}`;
}

export async function uploadVehiclePhotoFile(path: string, file: UploadedFile, mime: AllowedMime): Promise<string> {
    const { error } = await supabaseAdmin.storage.from(env.vehiclePhotoBucket).upload(path, file.buffer, {
        contentType: mime,
        upsert: false,
    });
    if (error) throw error;
    return path;
}

export async function removeVehiclePhotoFile(path: string | null | undefined): Promise<void> {
    if (!path) return;
    const { error } = await supabaseAdmin.storage.from(env.vehiclePhotoBucket).remove([path]);
    if (error) {
        console.error("[vehicles.photo.storage] failed to remove object", { path, error: error.message });
    }
}

/** The only way vehicle-photo bytes leave the private bucket. */
export async function createSignedVehiclePhotoUrl(path: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
        .from(env.vehiclePhotoBucket)
        .createSignedUrl(path, env.kycSignedUrlTtlSeconds);
    if (error || !data) throw error ?? new Error("Could not create signed URL");
    return data.signedUrl;
}
