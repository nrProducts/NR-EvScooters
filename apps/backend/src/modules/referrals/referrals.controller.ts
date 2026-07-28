import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./referrals.service";
import { RedeemReferralBody } from "./referrals.validation";

export async function myReferralSummaryHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyReferralSummary(req.user!.id));
}

export async function redeemReferralHandler(req: AuthedRequest, res: Response) {
    const { code } = req.body as RedeemReferralBody;
    res.json(await service.redeemReferralCode(req.user!.id, code, req.user!));
}
