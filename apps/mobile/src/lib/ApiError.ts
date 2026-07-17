/**
 * Standalone by design: no Supabase, no env, no fetch. Both the API client and
 * the in-memory mock throw these, so screens handle one error type regardless
 * of where the data came from — and the mock stays testable outside React
 * Native.
 */
export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly fields?: Record<string, string>,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    /** True when there is nothing the user can do by retrying the same input. */
    get isValidation(): boolean {
        return this.status === 400 || this.status === 422 || this.status === 409;
    }

    get isOffline(): boolean {
        return this.status === 0;
    }
}
