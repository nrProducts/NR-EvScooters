import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { badRequest } from "../../common/AppError";
import * as c from "./purchases.controller";
import * as v from "./purchases.validation";

/** A bill's photo or PDF; checked by magic number in the service, not by the name. */
const billFileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single("file");

/** The GSTR-2B JSON from the GST portal. */
const twoBUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (/\.json$/i.test(file.originalname)) return cb(null, true);
        cb(badRequest("Upload the GSTR-2B JSON file downloaded from the GST portal."));
    },
}).single("file");

/**
 * Mounted at /api/v1/purchases (GST Stage 4).
 * `purchases.view` reads; `purchases.create` enters bills and vendors;
 * `purchases.edit` confirms, cancels, links payments and imports GSTR-2B.
 */
const router = Router();
router.use(requireAuth);

router.get("/categories", requireAction("purchases", "view"), c.categoriesHandler);

router.get("/vendors", requireAction("purchases", "view"), validate({ query: v.vendorsQuery }), asyncHandler(c.listVendorsHandler));
router.post("/vendors", requireAction("purchases", "create"), validate({ body: v.vendorBody }), asyncHandler(c.createVendorHandler));
router.patch("/vendors/:id", requireAction("purchases", "create"), validate({ params: v.idParam, body: v.vendorBody }), asyncHandler(c.updateVendorHandler));

// One-step expense: payee, category, amount paid and how — saved confirmed.
router.post("/expenses", requireAction("purchases", "create"), validate({ body: v.expenseBody }), asyncHandler(c.createExpenseHandler));

router.get("/bills", requireAction("purchases", "view"), validate({ query: v.listBillsQuery }), asyncHandler(c.listBillsHandler));
router.post("/bills", requireAction("purchases", "create"), validate({ body: v.billBody }), asyncHandler(c.createBillHandler));
router.post("/bills/draft-from-statements", requireAction("purchases", "create"), validate({ body: v.optionalMonthBody }), asyncHandler(c.draftFromStatementsHandler));
router.get("/bills/:id", requireAction("purchases", "view"), validate({ params: v.idParam }), asyncHandler(c.getBillHandler));
router.put("/bills/:id", requireAction("purchases", "create"), validate({ params: v.idParam, body: v.billBody }), asyncHandler(c.updateBillHandler));
router.post("/bills/:id/confirm", requireAction("purchases", "edit"), validate({ params: v.idParam }), asyncHandler(c.confirmBillHandler));
router.post("/bills/:id/cancel", requireAction("purchases", "edit"), validate({ params: v.idParam, body: v.cancelBody }), asyncHandler(c.cancelBillHandler));
router.post("/bills/:id/file", requireAction("purchases", "create"), billFileUpload, validate({ params: v.idParam }), asyncHandler(c.uploadBillFileHandler));
router.get("/bills/:id/file", requireAction("purchases", "view"), validate({ params: v.idParam }), asyncHandler(c.billFileUrlHandler));
router.get("/bills/:id/payment-candidates", requireAction("purchases", "edit"), validate({ params: v.idParam }), asyncHandler(c.paymentCandidatesHandler));
router.post("/bills/:id/payments", requireAction("purchases", "edit"), validate({ params: v.idParam, body: v.linkPaymentBody }), asyncHandler(c.linkPaymentHandler));
router.post("/bills/:id/payment-method", requireAction("purchases", "edit"), validate({ params: v.idParam, body: v.paymentMethodBody }), asyncHandler(c.paymentMethodHandler));
router.delete("/bills/:id/payments/:lineId", requireAction("purchases", "edit"), validate({ params: v.billLineParams }), asyncHandler(c.unlinkPaymentHandler));

router.get("/payables", requireAction("purchases", "view"), asyncHandler(c.payablesHandler));
router.get("/itc", requireAction("purchases", "view"), validate({ query: v.monthQuery }), asyncHandler(c.itcSummaryHandler));
router.post("/gstr2b", requireAction("purchases", "edit"), twoBUpload, asyncHandler(c.importGstr2bHandler));
router.get("/gstr2b/not-in-books", requireAction("purchases", "view"), validate({ query: v.monthQuery }), asyncHandler(c.twoBNotInBooksHandler));

router.get("/assets", requireAction("purchases", "view"), validate({ query: v.assetsQuery }), asyncHandler(c.assetsHandler));
router.put("/assets/:id/cost", requireAction("purchases", "edit"), validate({ params: v.idParam, body: v.vehicleCostBody }), asyncHandler(c.vehicleCostHandler));

export default router;
