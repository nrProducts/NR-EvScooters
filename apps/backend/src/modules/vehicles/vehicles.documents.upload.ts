import multer from "multer";
import { env } from "../../config/env";

/**
 * Memory storage, same reasoning as kyc.upload.ts: bytes never touch disk,
 * live in a buffer only long enough to be validated and streamed into the
 * private bucket. One file per document (no front/back split — a vehicle
 * document is a single certificate/scan).
 */
export const vehicleDocumentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.vehicleDocumentMaxFileBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "application/pdf"];
        cb(null, allowed.includes(file.mimetype));
    },
}).single("file");
