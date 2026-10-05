import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./revenue.service";
import type {
    RevenueExportQuery, RevenueRangeQuery, RevenueSummaryQuery, RevenueTransactionsQuery, RevenueTrendQuery,
} from "./revenue.validation";
import type { RevenueTransactionFilters } from "./revenue.types";

export async function revenueSummaryHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueSummaryQuery>(req);
    const compare = q.compareFrom && q.compareTo ? { from: q.compareFrom, to: q.compareTo } : undefined;
    res.json(await service.getRevenueSummary(q.from, q.to, compare));
}

export async function revenueTrendHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueTrendQuery>(req);
    res.json(await service.getRevenueTrend(q.from, q.to, q.granularity));
}

export async function revenueByTypeHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueRangeQuery>(req);
    res.json(await service.getRevenueByType(q.from, q.to));
}

export async function revenueByMethodHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueRangeQuery>(req);
    res.json(await service.getRevenueByMethod(q.from, q.to));
}

export async function revenueRefundsHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueRangeQuery>(req);
    res.json(await service.getRefundBreakdown(q.from, q.to));
}

export async function revenueDepositsHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueRangeQuery>(req);
    res.json(await service.getDepositSummary(q.from, q.to));
}

function toFilters(q: RevenueTransactionsQuery): RevenueTransactionFilters {
    return {
        from: q.from, to: q.to, search: q.search, riderId: q.riderId, vehicleId: q.vehicleId,
        type: q.type, method: q.method, paymentStatus: q.paymentStatus, refundStatus: q.refundStatus,
        page: q.page, pageSize: q.pageSize, sortBy: q.sortBy, sortDir: q.sortDir,
    };
}

export async function revenueTransactionsHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueTransactionsQuery>(req);
    res.json(await service.getRevenueTransactions(toFilters(q)));
}

export async function revenueExportHandler(req: AuthedRequest, res: Response) {
    const q = validatedQuery<RevenueExportQuery>(req);
    const { filename, contentType, body } = await service.buildRevenueExport(toFilters(q), q.format);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    // The browser fetch() can only read this header cross-origin if it's exposed.
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.send(body);
}
