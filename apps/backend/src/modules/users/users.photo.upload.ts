import multer from "multer";
import { env } from "../../config/env";

/**
 * Memory storage, same reasoning as kyc.upload.ts: the photo buffer never
 * touches disk, only long enough to be validated and streamed to the
 * private bucket.
 */
export const photoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.profilePhotoMaxFileBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
        cb(null, ["image/jpeg", "image/png"].includes(file.mimetype));
    },
}).single("photo");
