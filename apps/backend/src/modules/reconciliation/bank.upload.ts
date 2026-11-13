import multer from "multer";
import { badRequest } from "../../common/AppError";

/** A month's HDFC export is a few dozen KB; a year is well under this. */
const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

/**
 * An HDFC account statement as NetBanking exports it: .xls (its default),
 * .xlsx, or the delimited .csv / .txt. Memory storage — the bytes are parsed,
 * checked and only then stored (privately) as audit evidence.
 */
export const bankStatementUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_STATEMENT_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (/\.(xls|xlsx|csv|txt)$/i.test(file.originalname)) return cb(null, true);
        cb(badRequest("Upload the statement exactly as HDFC NetBanking exports it: .xls, .xlsx, .csv or .txt. PDF statements are not accepted."));
    },
}).single("file");
