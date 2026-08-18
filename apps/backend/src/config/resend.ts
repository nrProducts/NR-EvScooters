import { Resend } from "resend";
import { serviceUnavailable } from "../common/AppError";
import { env } from "./env";

let client: Resend | null = null;

/** True once both an API key and a from-address are configured. */
export function isEmailConfigured(): boolean {
    return Boolean(env.resendApiKey && env.emailFrom);
}

/**
 * Lazily constructed — never at import time. Keys are allowed to be empty in
 * dev (see env.ts), so the server must still boot with none configured; only
 * a call site that actually needs the provider sees an error, and it's a
 * clean 503 rather than a crash. Callers must check isEmailConfigured() (or
 * catch) rather than let this throw into a business-logic path — see
 * notify.service.ts's sendEmail, which is the only caller.
 */
export function getResend(): Resend {
    if (!isEmailConfigured()) {
        throw serviceUnavailable("Email provider is not configured.");
    }
    if (!client) {
        client = new Resend(env.resendApiKey);
    }
    return client;
}
