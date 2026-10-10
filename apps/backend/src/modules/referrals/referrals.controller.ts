import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./referrals.service";
import { RedeemReferralBody, UpdateReferralProgramBody } from "./referrals.validation";

export async function myReferralSummaryHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyReferralSummary(req.user!.id));
}

export async function redeemReferralHandler(req: AuthedRequest, res: Response) {
    const { code } = req.body as RedeemReferralBody;
    res.json(await service.redeemReferralCode(req.user!.id, code, req.user!, req));
}

export async function getReferralProgramHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getProgramForAdmin());
}

export async function updateReferralProgramHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateReferralProgramBody;
    res.json(await service.updateReferralProgram(body, req.user!, req));
}
