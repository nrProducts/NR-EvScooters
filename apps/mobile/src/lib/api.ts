import { Platform } from 'react-native';
import { ENV } from '../constants/env';
import { getAccessToken, getSupabase } from './supabase';
import { ApiError } from './ApiError';
import { signInWithGoogleBrowser } from './googleAuth';

// Re-exported so existing `import { ApiError } from '../lib/api'` keeps working.
export { ApiError };
import type {
    ApiAvailability, ApiBooking, ApiBookingWithPlan, ApiConsentHistoryItem, ApiConsentNotice,
    ApiConsentState, ApiDamage, ApiDeposit, ApiDocument, ApiEarlyRecharge, ApiErrorBody,
    ApiInvoice, ApiKycSummary, ApiLegalAcceptanceState, ApiLegalDocument, ApiMaintenanceNotice, ApiMaintenanceRecord, ApiMe, ApiNotification,
    ApiNominee, ApiPrivacyRequest, ApiPrivacySummary, ConsentPurpose, CorrectableField,
    DpRequestType, GeocodeArea,
    ApiOverdueLateFee, ApiOverdueLateFeeInvoice, ApiReturnStage,
    ApiPaymentOrder, ApiPlanQuote, ApiReferralSummary, ApiRental, ApiReturnSettlement, ApiSignedUrl, ApiStation, ApiSupportRequest,
    ApiUserDetail, ApiVehicleModel, ApiVehicleModelDetail, CreateBookingOrderPayload, CreateSupportRequestPayload,
    KycDocType, ListVehicleModelsParams, LocalFile, MaintenanceHistoryParams, Paginated,
    ReturnRequestPayload, UpdateUserPayload, VerifyPaymentPayload,
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
    /**
     * Caller's abort signal, chained to this request's own timeout. Used by
     * type-ahead callers so a newer keystroke cancels the in-flight request
     * rather than racing it.
     */
    signal?: AbortSignal;
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

/**
 * Exported so a feature module can own its own typed service (see
 * features/battery-stations/api/batteryStationService.ts) while still going
 * through this client — auth header, timeout, 401 handling and ApiError
 * mapping all stay in one place. Prefer the `api` object below for anything
 * that belongs to the app's core surface.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, query, form, signal } = options;

    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    // Let fetch set the multipart boundary itself — setting Content-Type by
    // hand here is the classic way to break a React Native upload.
    if (!form && body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    // Chain rather than replace: whichever fires first wins, and the timeout
    // still applies to a caller who passes a signal they never abort.
    const onExternalAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onExternalAbort);
    }

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
        signal?.removeEventListener('abort', onExternalAbort);
        const aborted = (err as Error)?.name === 'AbortError';
        console.warn('[api] network error', { method, path, aborted, message: (err as Error)?.message });
        throw new ApiError(
            0,
            aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
            aborted
                ? 'The server took too long to respond. Check your connection and try again.'
                : "Couldn't reach the server. Check your connection and try again.",
        );
    }
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);

    if (response.status === 401) {
        console.warn('[api] 401', { method, path, hadToken: !!token });
        // /auth/logout's own 401 must not re-trigger onUnauthorized — that
        // path IS the sign-out flow, so re-firing it here is exactly what
        // turns a single bad token into an infinite sign-out loop.
        //
        // Neither must a 401 on a request we KNOWINGLY SENT NO TOKEN WITH.
        // getAccessToken() returns null both when the rider is genuinely
        // signed out AND when supabase-js cannot reach Supabase to read or
        // refresh the session — and the second case is a network outage, not
        // a rejected credential. Firing the global sign-out there tore down a
        // perfectly good session because the phone briefly could not resolve
        // supabase.co: the rider was bounced to the sign-in screen, and the
        // stored session was wiped, so they could not get back in until the
        // network recovered. A 401 only means "your session expired" if we
        // actually presented one.
        if (token && path !== '/auth/logout') onUnauthorized();
        throw new ApiError(
            401,
            'UNAUTHENTICATED',
            token
                ? 'Your session has expired. Please sign in again.'
                : "Couldn't verify your sign-in. Check your connection and try again.",
        );
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
 * from disk rather than loading base64 into JS memory. The browser's real
 * FormData has no idea what to do with that shape — it needs an actual
 * Blob/File — so on web, fetch the blob:/data: URL expo-image-picker's web
 * shim hands back and re-append it as a proper Blob instead.
 */
async function appendFile(form: FormData, field: string, file: LocalFile): Promise<void> {
    if (Platform.OS === 'web') {
        const blob = await (await fetch(file.uri)).blob();
        form.append(field, blob, file.name);
        return;
    }
    form.append(field, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
    } as unknown as Blob);
}

export const api = {
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

    uploadMyPhoto: async (photo: LocalFile) => {
        const form = new FormData();
        await appendFile(form, 'photo', photo);
        return request<{ profile_photo_url: string }>('/users/me/photo', { method: 'POST', form });
    },

    myPhotoUrl: () => request<ApiSignedUrl>('/users/me/photo/url'),

    registerPushToken: (token: string) =>
        request<void>('/users/me/push-token', {
            method: 'POST',
            body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
        }),

    // --- notifications -----------------------------------------------------
    myNotifications: (params: { page?: number; pageSize?: number } = {}) =>
        request<Paginated<ApiNotification>>('/users/me/notifications', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    unreadNotificationCount: () =>
        request<{ count: number }>('/users/me/notifications/unread-count'),

    markNotificationRead: (id: string) =>
        request<ApiNotification>(`/users/me/notifications/${id}/read`, { method: 'PATCH' }),

    markAllNotificationsRead: () =>
        request<void>('/users/me/notifications/read-all', { method: 'POST' }),

    // --- geocoding (proxied; see features/battery-stations/api/geocodeService) ---
    geocodeSearch: (
        params: { q: string; lat?: number; lng?: number },
        signal?: AbortSignal,
    ) => request<{ data: GeocodeArea[] }>('/geocode/search', { query: params, signal }),

    // --- Terms & Conditions -----------------------------------------------
    // Separate from the consent calls below on purpose: those establish a
    // lawful basis for processing data, these record acceptance of the
    // rental contract — the evidence behind a late fee or damage charge.
    termsDocument: (lang: 'en' | 'ta') =>
        request<ApiLegalDocument>('/legal/documents/terms', { query: { lang } }),

    myTermsState: () => request<ApiLegalAcceptanceState>('/users/me/legal/terms'),

    /**
     * The version being displayed is sent back so the server can refuse an
     * acceptance made against terms that were retired while the screen was
     * open — the rider must never be recorded as agreeing to words they did
     * not see. `language` is what they actually read, not their app-wide
     * preference, since the Tamil body may not exist.
     */
    acceptTerms: (input: { version: string; language: 'en' | 'ta' }) =>
        request<ApiLegalAcceptanceState>('/users/me/legal/acceptances', {
            method: 'POST',
            body: { doc_type: 'terms', ...input },
        }),

    // --- DPDPA consent ----------------------------------------------------
    consentNotice: (lang: 'en' | 'ta') =>
        request<ApiConsentNotice>('/consent/notice', { query: { lang } }),

    myConsents: () => request<ApiConsentState>('/users/me/consents'),

    myConsentHistory: () =>
        request<{ data: ApiConsentHistoryItem[] }>('/users/me/consents/history'),

    /**
     * The notice version is sent back so the server can reject a submission
     * made against a notice that was retired while the screen was open — the
     * rider must never be recorded as consenting to words they did not see.
     */
    setConsents: (input: {
        notice_version: string;
        language: 'en' | 'ta';
        device_id?: string;
        grants: { purpose: ConsentPurpose; granted: boolean }[];
    }) => request<ApiConsentState>('/users/me/consents', { method: 'POST', body: input }),

    withdrawConsent: (purpose: ConsentPurpose) =>
        request<ApiConsentState>(`/users/me/consents/${purpose}`, { method: 'DELETE' }),

    // --- DPDPA rights (ss.11-14) ------------------------------------------
    createPrivacyRequest: (input: {
        type: DpRequestType;
        details?: string;
        requested_changes?: { field: CorrectableField; value: string }[];
    }) => request<ApiPrivacyRequest>('/users/me/privacy/requests', { method: 'POST', body: input }),

    myPrivacyRequests: (params: { page?: number; pageSize?: number; type?: DpRequestType } = {}) =>
        request<Paginated<ApiPrivacyRequest>>('/users/me/privacy/requests', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    privacyRequest: (id: string) =>
        request<ApiPrivacyRequest>(`/users/me/privacy/requests/${id}`),

    cancelPrivacyRequest: (id: string) =>
        request<ApiPrivacyRequest>(`/users/me/privacy/requests/${id}/cancel`, { method: 'POST' }),

    /** The rider's s.11 summary: what we hold, why, and who else receives it. */
    privacySummary: () => request<ApiPrivacySummary>('/users/me/privacy/summary'),

    myNominee: () => request<ApiNominee>('/users/me/privacy/nominee'),

    updateNominee: (input: {
        full_name: string;
        relationship: string;
        phone?: string;
        email?: string;
    }) => request<ApiNominee>('/users/me/privacy/nominee', { method: 'PATCH', body: input }),

    deleteNominee: () => request<void>('/users/me/privacy/nominee', { method: 'DELETE' }),

    // --- rider KYC -------------------------------------------------------
    myKyc: () => request<ApiKycSummary>('/users/me/kyc'),

    uploadMyDocument: async (input: {
        doc_type: KycDocType;
        doc_number: string;
        expires_on?: string;
        front: LocalFile;
        back?: LocalFile;
    }) => {
        const form = new FormData();
        form.append('doc_type', input.doc_type);
        form.append('doc_number', input.doc_number);
        if (input.expires_on) form.append('expires_on', input.expires_on);
        await appendFile(form, 'front', input.front);
        if (input.back) await appendFile(form, 'back', input.back);
        return request<ApiDocument>('/users/me/kyc/documents', { method: 'POST', form });
    },

    updateMyDocument: async (
        documentId: string,
        input: { doc_number?: string; expires_on?: string; front?: LocalFile; back?: LocalFile },
    ) => {
        const form = new FormData();
        if (input.doc_number) form.append('doc_number', input.doc_number);
        if (input.expires_on) form.append('expires_on', input.expires_on);
        if (input.front) await appendFile(form, 'front', input.front);
        if (input.back) await appendFile(form, 'back', input.back);
        return request<ApiDocument>(`/users/me/kyc/documents/${documentId}`, { method: 'PATCH', form });
    },

    deleteMyDocument: (documentId: string) =>
        request<void>(`/users/me/kyc/documents/${documentId}`, { method: 'DELETE' }),

    myDocumentUrl: (documentId: string, side: 'front' | 'back' = 'front') =>
        request<ApiSignedUrl>(`/users/me/kyc/documents/${documentId}/url`, { query: { side } }),

    submitMyKyc: () => request<ApiKycSummary>('/users/me/kyc/submit', { method: 'POST' }),

    // --- vehicle catalog (rider browse/detail) ----------------------------
    listVehicleModels: (params: ListVehicleModelsParams = {}) =>
        request<Paginated<ApiVehicleModel>>('/vehicle-models', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    featuredVehicleModel: () => request<ApiVehicleModel>('/vehicle-models/featured'),

    fleetAvailabilitySummary: () =>
        request<{ available_count: number }>('/vehicle-models/availability-summary'),

    getVehicleModel: (id: string) => request<ApiVehicleModelDetail>(`/vehicle-models/${id}`),

    /** Station-scoped when stationId is given — what booking actually needs. */
    vehicleModelAvailability: (id: string, stationId?: string) =>
        request<ApiAvailability>(`/vehicle-models/${id}/availability`, { query: { stationId } }),

    // --- bookings -----------------------------------------------------
    /**
     * Pay-first checkout: creates a payment_orders "booking intent" only. No
     * booking exists until this order's payment captures and the backend
     * materialises it. Retrying with the same plan/date reuses the one open
     * intent, so a cancelled payment does not block re-booking.
     */
    createBookingOrder: (payload: CreateBookingOrderPayload) =>
        request<ApiPaymentOrder>('/payments/bookings/order', { method: 'POST', body: payload }),

    myCurrentBooking: () => request<ApiBookingWithPlan>('/bookings/me/current'),

    myBookingById: (bookingId: string) => request<ApiBookingWithPlan>(`/bookings/me/${bookingId}`),

    cancelBooking: (bookingId: string, reason?: string) =>
        request<ApiBooking>(`/bookings/${bookingId}/cancel`, {
            method: 'POST',
            body: reason ? { reason } : {},
        }),

    bookingHistory: (params: { page?: number; pageSize?: number } = {}) =>
        request<Paginated<ApiBooking>>('/bookings/me/history', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    /** Opens on the last day of the current plan — generates (or fetches, idempotently) the upcoming period's invoice to pay ahead of the overdue-lock. */
    requestEarlyRecharge: (bookingId: string) =>
        request<ApiEarlyRecharge>(`/bookings/me/${bookingId}/recharge`, { method: 'POST' }),

    nearestStation: (lat: number, lng: number) =>
        request<ApiStation>('/stations/nearest', { query: { lat, lng } }),

    // --- payments ----------------------------------------------------------
    // Amount is always computed server-side from the plan/invoice on record —
    // the app only ever sends an id, never an amount.
    createPaymentOrderForBooking: (bookingId: string) =>
        request<ApiPaymentOrder>(`/payments/bookings/${bookingId}/order`, { method: 'POST' }),

    /**
     * Itemised price for a plan, before any booking exists. Read-only, so
     * it is safe to call from a screen the rider may back out of.
     */
    quotePlan: (planId: string, startDay?: string) =>
        request<ApiPlanQuote>(
            `/payments/plans/${planId}/quote${startDay ? `?start_day=${startDay}` : ''}`,
        ),

    createPaymentOrderForInvoice: (invoiceId: string) =>
        request<ApiPaymentOrder>(`/payments/invoices/${invoiceId}/order`, { method: 'POST' }),

    verifyPayment: (payload: VerifyPaymentPayload) =>
        request<{ status: string }>('/payments/verify', { method: 'POST', body: payload }),

    // --- rider billing (payment history, deposit, damage) ------------------
    myInvoices: (params: { page?: number; pageSize?: number; bookingId?: string } = {}) =>
        request<Paginated<ApiInvoice>>('/invoices/me', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    myDepositForBooking: (bookingId: string) => request<ApiDeposit>(`/deposits/me/booking/${bookingId}`),

    myDamagesForBooking: (bookingId: string) =>
        request<ApiDamage[]>('/damages/me', { query: { bookingId } }),

    disputeDamage: (damageId: string, reason: string) =>
        request<ApiDamage>(`/damages/${damageId}/dispute`, { method: 'POST', body: { reason } }),

    // --- referrals ---------------------------------------------------------
    myReferralSummary: () => request<ApiReferralSummary>('/referrals/me'),

    redeemReferralCode: (code: string) =>
        request<void>('/referrals/redeem', { method: 'POST', body: { code } }),

    // --- rentals -------------------------------------------------------
    myCurrentRental: () => request<ApiRental>('/rentals/me/current'),

    requestRentalReturn: (rentalId: string, body: ReturnRequestPayload) =>
        request<ApiRental>(`/rentals/${rentalId}/return-request`, { method: 'POST', body }),

    rentalHistory: (params: { page?: number; pageSize?: number } = {}) =>
        request<Paginated<ApiRental>>('/rentals/me/history', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

    myRentalSettlement: () => request<ApiReturnSettlement | null>('/rentals/me/settlement'),

    // Overdue Rider → Late Fee Payment → Scooter Return gate. GET is a pure
    // preview; POST creates/reuses the payable invoice, then the normal
    // createPaymentOrderForInvoice / verifyPayment pair pays it.
    myOverdueLateFee: () => request<ApiOverdueLateFee>('/rentals/me/overdue-late-fee'),
    payMyOverdueLateFee: () =>
        request<ApiOverdueLateFeeInvoice>('/rentals/me/overdue-late-fee', { method: 'POST' }),

    // Vehicle Return → Inspection → Payment Gate → Approve Return, from the
    // rider's own side. Null once there's no return to report on.
    myReturnStage: () => request<ApiReturnStage | null>('/rentals/me/return-stage'),

    // --- maintenance ---------------------------------------------------
    maintenanceHistory: (params: MaintenanceHistoryParams = {}) =>
        request<Paginated<ApiMaintenanceRecord>>('/maintenance/me/history', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),
    maintenanceNotice: () => request<ApiMaintenanceNotice | null>('/maintenance/me/notice'),

    // --- support ---------------------------------------------------------
    createSupportRequest: (payload: CreateSupportRequestPayload) =>
        request<ApiSupportRequest>('/users/me/support', { method: 'POST', body: payload }),

    mySupportRequests: (params: { page?: number; pageSize?: number } = {}) =>
        request<Paginated<ApiSupportRequest>>('/users/me/support', {
            query: params as Record<string, string | number | boolean | undefined>,
        }),

};
