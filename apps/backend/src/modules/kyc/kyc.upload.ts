import multer from "multer";
import { env } from "../../config/env";

/**
 * Memory storage is deliberate: KYC bytes must never touch the API server's
 * disk. They live in a buffer only long enough to be validated and streamed
 * into the private bucket.
 *
 * The real MIME check is the magic-number test in kyc.storage.ts — the filter
 * here is only a cheap first pass on the client's claim.
 */
export const kycUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.kycMaxFileBytes, files: 2 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "application/pdf"];
        cb(null, allowed.includes(file.mimetype));
    },
}).fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
]);
