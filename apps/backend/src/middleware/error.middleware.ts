import { Request, Response, NextFunction } from "express";
import { AppError } from "../common/AppError";
import { env } from "../config/env";

interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        fields?: Record<string, string>;
    };
}

/**
 * The single place an error becomes a response body. Deliberate AppErrors are
 * echoed as-is; everything else is logged server-side and flattened to a
 * generic 500 so Supabase/PostgREST messages, SQL text, bucket paths and stack
 * traces never reach a mobile client (§16).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
    if (err instanceof AppError) {
        const body: ApiErrorBody = { error: { code: err.code, message: err.message } };
        if (err.fields) body.error.fields = err.fields;
        return res.status(err.status).json(body);
    }

    if (isMulterLimitError(err)) {
        return res.status(413).json({
            error: { code: "PAYLOAD_TOO_LARGE", message: "The uploaded file is too large." },
        } satisfies ApiErrorBody);
    }

    console.error("[unhandled]", {
        method: req.method,
        path: req.originalUrl,
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    });

    const body: ApiErrorBody = {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    };
    res.status(500).json(body);
}

function isMulterLimitError(err: unknown): boolean {
    return (
        typeof err === "object" && err !== null &&
        (err as { code?: string }).code === "LIMIT_FILE_SIZE"
    );
}

/** 404 handler for unmatched routes; mount after all route registrations. */
export function notFoundHandler(_req: Request, res: Response) {
    res.status(404).json({
        error: { code: "NOT_FOUND", message: "Endpoint not found." },
    } satisfies ApiErrorBody);
}

export const isProduction = () => env.nodeEnv === "production";
