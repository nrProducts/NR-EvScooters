import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./auth.service";
import type { OtpTestBody } from "./auth.validation";

/** GET /auth/session — verified whoami used by the splash + profile screens. */
export async function sessionHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getSessionContext(req.user!));
}

/** POST /auth/logout — revokes all refresh tokens for the caller. */
export async function logoutHandler(req: AuthedRequest, res: Response) {
    await service.revokeAllSessions(req.user!.id);
    res.status(204).send();
}

/** POST /auth/otp/test — admin-only MSG91 delivery diagnostic. */
export async function otpTestHandler(req: AuthedRequest, res: Response) {
    const { phone } = req.body as OtpTestBody;
    res.json(await service.sendTestOtp(phone, req));
}
