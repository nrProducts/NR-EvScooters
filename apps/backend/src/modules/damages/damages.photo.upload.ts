import multer from "multer";
import { env } from "../../config/env";

/** Memory storage, same reasoning as vehicles.photo.upload.ts. Up to 6 condition photos per return inspection. */
export const damagePhotoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.vehiclePhotoMaxFileBytes, files: 6 },
    fileFilter: (_req, file, cb) => {
        cb(null, ["image/jpeg", "image/png"].includes(file.mimetype));
    },
}).array("photos", 6);
