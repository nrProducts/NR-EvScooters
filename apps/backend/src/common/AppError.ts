export type ErrorCode =
    | "VALIDATION_ERROR"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "PAYLOAD_TOO_LARGE"
    | "BUSINESS_RULE_VIOLATION"
    | "INTERNAL_ERROR";

export type FieldErrors = Record<string, string>;

/**
 * Every error the API returns on purpose. `status` is kept as the first
 * constructor argument so the pre-existing `new AppError(400, "...")` calls
 * in modules/vehicles keep compiling.
 */
export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly fields?: FieldErrors;

    constructor(
        public readonly status: number,
        message: string,
        code?: ErrorCode,
        fields?: FieldErrors,
    ) {
        super(message);
        this.name = "AppError";
        this.code = code ?? defaultCodeForStatus(status);
        this.fields = fields;
        Error.captureStackTrace?.(this, AppError);
    }
}

function defaultCodeForStatus(status: number): ErrorCode {
    switch (status) {
        case 400: return "VALIDATION_ERROR";
        case 401: return "UNAUTHENTICATED";
        case 403: return "FORBIDDEN";
        case 404: return "NOT_FOUND";
        case 409: return "CONFLICT";
        case 413: return "PAYLOAD_TOO_LARGE";
        case 422: return "BUSINESS_RULE_VIOLATION";
        default:  return "INTERNAL_ERROR";
    }
}

export const badRequest = (message: string, fields?: FieldErrors) =>
    new AppError(400, message, "VALIDATION_ERROR", fields);
export const unauthenticated = (message = "Authentication required.") =>
    new AppError(401, message, "UNAUTHENTICATED");
export const forbidden = (message = "You do not have permission to perform this action.") =>
    new AppError(403, message, "FORBIDDEN");
export const notFound = (message = "Resource not found.") =>
    new AppError(404, message, "NOT_FOUND");
export const conflict = (message: string, fields?: FieldErrors) =>
    new AppError(409, message, "CONFLICT", fields);
export const tooLarge = (message: string) =>
    new AppError(413, message, "PAYLOAD_TOO_LARGE");
/** 422: request was well-formed but violates a domain rule. */
export const businessRule = (message: string, fields?: FieldErrors) =>
    new AppError(422, message, "BUSINESS_RULE_VIOLATION", fields);
