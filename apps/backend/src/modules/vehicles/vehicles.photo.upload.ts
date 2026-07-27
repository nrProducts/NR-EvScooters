import multer from "multer";
import { env } from "../../config/env";

/** Memory storage, same reasoning as users.photo.upload.ts. */
export const vehiclePhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.vehiclePhotoMaxFileBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
        cb(null, ["image/jpeg", "image/png"].includes(file.mimetype));
    },
}).single("photo");
