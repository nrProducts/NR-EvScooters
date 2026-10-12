import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase";

/**
 * Which app actually made the request. Each client sets this header itself
 * (apps/web's httpClient, apps/mobile's lib/api.ts, apps/website's fetch
 * wrapper) — there is no reliable way to infer it after the fact: the mobile
 * app sends no browser Origin header at all, and the website only ever hits
 * a handful of /public/* routes, which isn't a strong enough signal once
 * those routes exist for more than one reason.
 */
export type RequestClient = "mobile" | "web" | "website" | "unknown";

export function clientFromRequest(req: Request): RequestClient {
    const header = req.header("x-client-app");
    if (header === "mobile" || header === "web" || header === "website") return header;
    return "unknown";
}

export interface LogRequestErrorInput {
    req: Request;
    statusCode: number;
    errorCode?: string;
    message?: string;
    userId?: string | null;
    stack?: string | null;
}

/**
 * Records one failed API call. Called from exactly one place — errorHandler
 * — so every error, expected (AppError) or not, leaves a trace an admin can
 * actually search, instead of only the unhandled ones that happened to also
 * reach console.error.
 *
 * Never throws. A logging failure must never turn a normal 4xx into a 500 —
 * worse, never replace the REAL error response with a logging one. Errors
 * here go to console only, same as any other best-effort side effect in this
 * codebase (see payments.service.ts's signOutError pattern).
 */
export async function logRequestError(input: LogRequestErrorInput): Promise<void> {
    try {
        const { error } = await supabaseAdmin.from("request_error_logs").insert({
            client: clientFromRequest(input.req),
            method: input.req.method,
            path: input.req.originalUrl,
            status_code: input.statusCode,
            error_code: input.errorCode ?? null,
            // Truncated — this is a debugging aid, not a blob store, and an
            // oversized message (a stray stringified payload, say) shouldn't
            // bloat a row meant to be skimmed in a table.
            message: input.message ? input.message.slice(0, 2000) : null,
            user_id: input.userId ?? null,
            stack: input.stack ? input.stack.slice(0, 4000) : null,
        });
        if (error) console.warn("[requestLog] could not write error log", error.message);
    } catch (err) {
        console.warn("[requestLog] could not write error log", err);
    }
}
