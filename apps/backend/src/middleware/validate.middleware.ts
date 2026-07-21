import { Response, NextFunction } from "express";
import { ZodError, ZodType } from "zod";
import { AuthedRequest } from "./auth.middleware";
import { badRequest, FieldErrors } from "../common/AppError";

interface Schemas {
    body?: ZodType;
    query?: ZodType;
    params?: ZodType;
}

/**
 * Validates and REPLACES req.body/query/params with the parsed result, so
 * handlers work with coerced, trimmed, known-shape data (§12 "Validate all
 * route parameters, query parameters, and request bodies").
 */
export const validate =
    (schemas: Schemas) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        try {
            if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
            if (schemas.query) {
                // Express 5 exposes req.query via a getter, so assign the parsed
                // object to a separate property rather than mutating it.
                Object.defineProperty(req, "validatedQuery", {
                    value: schemas.query.parse(req.query),
                    writable: true,
                    configurable: true,
                });
            }
            if (schemas.body) req.body = schemas.body.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof ZodError) return next(badRequest("Please correct the highlighted fields.", toFieldErrors(err)));
            next(err);
        }
    };

/** Typed accessor for the object produced by the `query` schema. */
export const validatedQuery = <T>(req: AuthedRequest): T =>
    (req as unknown as { validatedQuery: T }).validatedQuery;

function toFieldErrors(err: ZodError): FieldErrors {
    const fields: FieldErrors = {};
    for (const issue of err.issues) {
        const key = issue.path.join(".") || "_";
        if (!fields[key]) fields[key] = issue.message;
    }
    return fields;
}
