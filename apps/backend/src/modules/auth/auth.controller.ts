import { Request, Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { selfSignUpStaff } from "../users/users.service";
import * as service from "./auth.service";
import type { AccountExistsQuery, OtpTestBody, StaffSignupBody } from "./auth.validation";

/** POST /auth/signup — public, no auth. Always lands as an inactive `staff` account; see selfSignUpStaff(). */
export async function staffSignupHandler(req: Request, res: Response) {
    const body = req.body as StaffSignupBody;
    res.status(201).json(await selfSignUpStaff(body, req));
}

/** GET /auth/account-exists — public, no auth. Lets the login screen tell "no account" apart from "wrong password". */
export async function accountExistsHandler(req: AuthedRequest, res: Response) {
    const { identifier } = validatedQuery<AccountExistsQuery>(req);
    res.json({ exists: await service.checkAccountExists(identifier) });
}

/** GET /auth/session — verified whoami used by the splash + profile screens. */
export async function sessionHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getSessionContext(req.user!));
}

/** POST /auth/logout — revokes all refresh tokens for the caller. */
export async function logoutHandler(req: AuthedRequest, res: Response) {
    console.info("[auth] logout requested", { userId: req.user!.id });
    await service.revokeAllSessions(req.user!.id);
    res.status(204).send();
}

/** POST /auth/complete-password-change — clears the temporary-password flag once the caller has set their own. */
export async function completePasswordChangeHandler(req: AuthedRequest, res: Response) {
    await service.completePasswordChange(req.user!.id);
    res.status(204).send();
}

/** POST /auth/otp/test — admin-only MSG91 delivery diagnostic. */
export async function otpTestHandler(req: AuthedRequest, res: Response) {
    const { phone } = req.body as OtpTestBody;
    res.json(await service.sendTestOtp(phone, req));
}
