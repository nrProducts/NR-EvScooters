import { ENV } from '../constants/env';
import { getAccessToken, getSupabase } from './supabase';
import { ApiError } from './ApiError';
import { signInWithGoogleBrowser } from './googleAuth';

// Re-exported so existing `import { ApiError } from '../lib/api'` keeps working.
export { ApiError };
import type {
    ApiBooking, ApiDocument, ApiErrorBody, ApiKycDetail, ApiKycQueueItem, ApiKycSummary, ApiMe,
    ApiSignedUrl, ApiStation, ApiUser, ApiUserDetail, ApiVehicleModel, ApiVehicleModelDetail,
    CreateBookingPayload, CreateUserPayload, KycDocType, KycStatus, ListUsersParams,
    ListVehicleModelsParams, LocalFile, Paginated, RoleName, StatusAction, UpdateUserPayload,
} from '../types/api';

type OnUnauthorized = () => void;
let onUnauthorized: OnUnauthorized = () => {};

/** The auth store registers here so a 401 anywhere ends the session once. */
export function setUnauthorizedHandler(handler: OnUnauthorized): void {
    onUnauthorized = handler;
}

/** Map a Supabase auth error to our status; 429 (too many requests) is common
 *  for OTP re-sends and deserves its own message, everything else is a 400. */
function mapOtpStatus(error: { status?: number }): number {
    return error?.status === 429 ? 429 : 400;
}

const TIMEOUT_MS = 20000;

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    /** Multipart parts. When present, `body` is ignored. */
    form?: FormData;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(ENV.apiUrl.replace(/\/$/, '') + path);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
        }
    }
    return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, query, form } = options;

    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    // Let fetch set the multipart boundary itself — setting Content-Type by
    // hand here is the classic way to break a React Native upload.
    if (!form && body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(buildUrl(path, query), {
            method,
            headers,
            body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timeout);
        const aborted = (err as Error)?.name === 'AbortError';
        throw new ApiError(
            0,
            aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
            aborted
                ? 'The server took too long to respond. Check your connection and try again.'
                : "Couldn't reach the server. Check your connection and try again.",
        );
    }
    clearTimeout(timeout);

    if (response.status === 401) {
        onUnauthorized();
        throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
        try {
            payload = JSON.parse(text);
        } catch {
            // A non-JSON body means a proxy/tunnel answered, not our API.
            throw new ApiError(response.status, 'BAD_RESPONSE', 'The server returned an unexpected response.');
        }
    }

    if (!response.ok) {
        const envelope = payload as ApiErrorBody | null;
        const err = envelope?.error;
        throw new ApiError(
            response.status,
            err?.code ?? 'INTERNAL_ERROR',
            err?.message ?? 'Something went wrong. Please try again.',
            err?.fields,
        );
    }

    return payload as T;
}

/**
 * React Native's FormData takes {uri, name, type} for a file part; it streams
 * from disk rather than loading base64 into JS memory.
 */
function appendFile(form: FormData, field: string, file: LocalFile): void {
    form.append(field, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
    } as unknown as Blob);
}

export const api = {
    // --- auth ------------------------------------------------------------
    async signIn(email: string, password: string): Promise<void> {
        const { error } = await getSupabase().auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
        });
        if (error) throw new ApiError(401, 'UNAUTHENTICATED', error.message);
    },

    async signOut(): Promise<void> {
        await getSupabase().auth.signOut();
    },

    async sendPasswordReset(email: string): Promise<void> {
        const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase());
        if (error) throw new ApiError(400, 'VALIDATION_ERROR', error.message);
    },

    // --- phone OTP (primary rider login) ---------------------------------
    async requestPhoneOtp(phone: string): Promise<void> {
        // Supabase generates the code, rate-limits it, and invokes the send-sms
        // hook (MSG91) to deliver it. shouldCreateUser=true so a first-time
        // number becomes an account on successful verification.
        const { error } = await getSupabase().auth.signInWithOtp({
            phone,
            options: { shouldCreateUser: true },
        });
        if (error) throw new ApiError(mapOtpStatus(error), 'OTP_REQUEST_FAILED', error.message);
    },

    async verifyPhoneOtp(phone: string, token: string): Promise<void> {
        const { error } = await getSupabase().auth.verifyOtp({ phone, token, type: 'sms' });
        if (error) throw new ApiError(401, 'UNAUTHENTICATED', error.message);
    },

    // --- Google (secondary / recovery login) -----------------------------
    async signInWithGoogle(): Promise<void> {
        await signInWithGoogleBrowser();
    },

    // --- session ---------------------------------------------------------
    async signOutEverywhere(): Promise<void> {
        // Best-effort server-side revocation of all refresh tokens, then the
        // local sign-out. A failure here still clears the local session.
        try {
            await request<void>('/auth/logout', { method: 'POST' });
        } catch {
            // ignore — local signOut below is what the user sees
        }
        await getSupabase().auth.signOut();
    },

    // --- users -----------------------------------------------------------
    me: () => request<ApiMe>('/users/me'),

    updateMe: (patch: UpdateUserPayload) =>
        request<ApiUserDetail>('/users/me', { method: 'PATCH', body: patch }),

    listUsers: (params: ListUsersParams = {}) =>
        request<Paginated<ApiUser>>('/users', { query: params as Record<string, string | number | boolean | undefined> }),

    getUser: (id: string) => request<ApiUserDetail>(`/users/${id}`),

    createUser: (payload: CreateUserPayload) =>
        request<ApiUserDetail>('/users', { method: 'POST', body: payload }),

    updateUser: (id: string, patch: UpdateUserPayload) =>
        request<ApiUserDetail>(`/users/${id}`, { method: 'PATCH', body: patch }),

    deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),

    restoreUser: (id: string) => request<ApiUserDetail>(`/users/${id}/restore`, { method: 'POST' }),

    changeStatus: (id: string, action: StatusAction, reason?: string) =>
        request<ApiUserDetail>(`/users/${id}/status`, { method: 'PATCH', body: { action, reason } }),

    uploadMyPhoto: (photo: LocalFile) => {
        const form = new FormData();
        appendFile(form, 'photo', photo);
        return request<{ profile_photo_url: string }>('/users/me/photo', { method: 'POST', form });
    },

    myPhotoUrl: () => request<ApiSignedUrl>('/users/me/photo/url'),

    getRoles: (id: string) => request<{ roles: RoleName[] }>(`/users/${id}/roles`),

    setRoles: (id: string, roles: RoleName[]) =>
        request<{ roles: RoleName[] }>(`/users/${id}/roles`, { method: 'PUT', body: { roles } }),

    // --- rider KYC -------------------------------------------------------
    myKyc: () => request<ApiKycSummary>('/users/me/kyc'),

    uploadMyDocument: (input: {
        doc_type: KycDocType;
        doc_number: string;
        expiry_date?: string;
        front: LocalFile;
        back?: LocalFile;
    }) => {
        const form = new FormData();
        form.append('doc_type', input.doc_type);
        form.append('doc_number', input.doc_number);
        if (input.expiry_date) form.append('expiry_date', input.expiry_date);
        appendFile(form, 'front', input.front);
        if (input.back) appendFile(form, 'back', input.back);
        return request<ApiDocument>('/users/me/kyc/documents', { method: 'POST', form });
    },

    updateMyDocument: (
        documentId: string,
        input: { doc_number?: string; expiry_date?: string; front?: LocalFile; back?: LocalFile },
    ) => {
        const form = new FormData();
        if (input.doc_number) form.append('doc_number', input.doc_number);
        if (input.expiry_date) form.append('expiry_date', input.expiry_date);
        if (input.front) appendFile(form, 'front', input.front);
        if (input.back) appendFile(form, 'back', input.back);
        return request<ApiDocument>(`/users/me/kyc/documents/${documentId}`, { method: 'PATCH', form });
    },

    deleteMyDocument: (documentId: string) =>
        request<void>(`/users/me/kyc/documents/${documentId}`, { method: 'DELETE' }),

    myDocumentUrl: (documentId: string, side: 'front' | 'back' = 'front') =>
        request<ApiSignedUrl>(`/users/me/kyc/documents/${documentId}/url`, { query: { side } }),

    submitMyKyc: () => request<ApiKycSummary>('/users/me/kyc/submit', { method: 'POST' }),

    // --- admin KYC -------------------------------------------------------
    listKyc: (params: {
        page?: number; pageSize?: number; search?: string; status?: KycStatus;
        docType?: KycDocType; sortBy?: string; sortDir?: 'asc' | 'desc';
    } = {}) =>
        request<Paginated<ApiKycQueueItem>>('/kyc', { query: params as Record<string, string | number | boolean | undefined> }),

    getKycDetail: (userId: string) => request<ApiKycDetail>(`/kyc/${userId}`),

    reviewDocumentUrl: (documentId: string, side: 'front' | 'back' = 'front') =>
        request<ApiSignedUrl>(`/kyc/documents/${documentId}/url`, { query: { side } }),

    verifyDocument: (documentId: string) =>
        request<ApiDocument>(`/kyc/documents/${documentId}/verify`, { method: 'POST' }),

    rejectDocument: (documentId: string, reason: string) =>
        request<ApiDocument>(`/kyc/documents/${documentId}/reject`, { method: 'POST', body: { reason } }),

    approveKyc: (userId: string) =>
        request<ApiKycSummary>(`/kyc/${userId}/approve`, { method: 'POST' }),

    rejectKyc: (userId: string, reason: string) =>
        request<ApiKycSummary>(`/kyc/${userId}/reject`, { method: 'POST', body: { reason } }),

    // --- vehicle catalog (rider browse/detail) ----------------------------
    listVehicleModels: (params: ListVehicleModelsParams = {}) =>
        request<Paginated<ApiVehicleModel>>('/vehicle-models', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    featuredVehicleModel: () => request<ApiVehicleModel>('/vehicle-models/featured'),

    getVehicleModel: (id: string) => request<ApiVehicleModelDetail>(`/vehicle-models/${id}`),

    // --- bookings (Phase 1 — no live payment) -----------------------------
    createBooking: (payload: CreateBookingPayload) =>
        request<ApiBooking>('/bookings', { method: 'POST', body: payload }),

    myCurrentBooking: () => request<ApiBooking>('/bookings/me/current'),

    nearestStation: (lat: number, lng: number) =>
        request<ApiStation>('/stations/nearest', { query: { lat, lng } }),
};
