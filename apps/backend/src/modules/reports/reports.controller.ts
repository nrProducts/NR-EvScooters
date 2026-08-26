import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { getPendingApprovals, getReportsSummary } from "./reports.service";

export async function getReportsSummaryHandler(_req: AuthedRequest, res: Response) {
    res.json(await getReportsSummary());
}

export async function getPendingApprovalsHandler(_req: AuthedRequest, res: Response) {
    res.json(await getPendingApprovals());
}
