import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./gst.controller";
import * as v from "./gst.validation";

/**
 * GST tax documents (Stage 1). Three routers, mounted most-specific first:
 *
 *   /gst/public — the one unauthenticated route: a PDF behind a short-lived
 *                 signed link the rider app opens in the system browser.
 *   /gst/me     — a rider's own tax invoices and credit notes.
 *   /gst        — the admin register, exports and GST profile.
 *
 * `gst.view` reads everything; `gst.configure` changes the GST profile and
 * runs the catch-up sweep. Neither can create, edit or delete a document —
 * documents are issued by the database as money moves.
 */

export const publicRouter = Router();
publicRouter.get(
    "/documents/:token",
    validate({ params: v.tokenParam }),
    asyncHandler(c.publicDocumentPdfHandler),
);

export const riderRouter = Router();
riderRouter.use(requireAuth);
riderRouter.get("/documents", validate({ query: v.myDocumentsQuery }), asyncHandler(c.myDocumentsHandler));
riderRouter.post("/documents/:id/link", validate({ params: v.docIdParam }), asyncHandler(c.myDocumentLinkHandler));
riderRouter.get("/documents/:id/pdf", validate({ params: v.docIdParam }), asyncHandler(c.myDocumentPdfHandler));

const router = Router();
router.use(requireAuth);

router.get("/documents", requireAction("gst", "view"), validate({ query: v.listTaxDocumentsQuery }), asyncHandler(c.listDocumentsHandler));
router.get("/documents/summary", requireAction("gst", "view"), validate({ query: v.summaryQuery }), asyncHandler(c.summaryHandler));
router.get("/documents/export", requireAction("gst", "view"), validate({ query: v.exportQuery }), asyncHandler(c.exportRegisterHandler));
router.get("/documents/export-pdfs", requireAction("gst", "view"), validate({ query: v.summaryQuery }), asyncHandler(c.exportPdfZipHandler));
router.get("/documents/pending", requireAction("gst", "view"), asyncHandler(c.pendingHandler));
router.post("/documents/issue-pending", requireAction("gst", "configure"), asyncHandler(c.issuePendingHandler));
// Declared after every literal /documents/<word> path so none is read as an id.
router.get("/documents/:id", requireAction("gst", "view"), validate({ params: v.docIdParam }), asyncHandler(c.getDocumentHandler));
router.get("/documents/:id/pdf", requireAction("gst", "view"), validate({ params: v.docIdParam }), asyncHandler(c.documentPdfHandler));

router.get("/profiles", requireAction("gst", "view"), asyncHandler(c.listProfilesHandler));
router.post("/profiles", requireAction("gst", "configure"), validate({ body: v.createGstProfileBody }), asyncHandler(c.createProfileHandler));

// --- Stage 5: monthly returns ------------------------------------------------------
router.get("/returns", requireAction("gst", "view"), asyncHandler(c.listReturnsHandler));
router.get("/returns/:month", requireAction("gst", "view"), validate({ params: v.monthParam }), asyncHandler(c.worksheetHandler));
router.get("/returns/:month/worksheet.xlsx", requireAction("gst", "view"), validate({ params: v.monthParam }), asyncHandler(c.worksheetXlsxHandler));
router.get("/returns/:month/gstr1.json", requireAction("gst", "view"), validate({ params: v.monthParam }), asyncHandler(c.gstr1JsonHandler));
// The pack is what the auditor login exists for, so it needs only gst.view.
router.get("/returns/:month/pack", requireAction("gst", "view"), validate({ params: v.monthParam }), asyncHandler(c.packHandler));
router.post("/returns/:month/status", requireAction("gst", "file"), validate({ params: v.monthParam, body: v.returnStatusBody }), asyncHandler(c.returnStatusHandler));

export default router;
