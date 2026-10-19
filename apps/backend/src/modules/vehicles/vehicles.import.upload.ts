import multer from "multer";
import { badRequest } from "../../common/AppError";

/** Big enough for MAX_IMPORT_ROWS vehicles with room to spare; a real template is a few KB. */
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

/**
 * The bulk-import spreadsheet. Memory storage like the document uploads — the
 * bytes are parsed and dropped, never stored. Browsers report .xlsx under
 * several types (some send octet-stream), so the extension decides.
 */
export const vehicleImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (/\.xlsx$/i.test(file.originalname)) return cb(null, true);
        cb(badRequest("Upload the .xlsx template. Older .xls and .csv files are not supported."));
    },
}).single("file");
