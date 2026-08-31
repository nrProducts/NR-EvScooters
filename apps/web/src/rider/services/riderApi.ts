/**
 * Rider-facing HTTP surface for the web app.
 *
 * Mirrors apps/mobile/src/lib/api.ts (the `api` object) endpoint-for-endpoint,
 * but goes through the web app's existing apiClient (Supabase bearer token +
 * ApiError mapping already handled — see apps/web/src/services/api/httpClient.ts).
 * Every rider endpoint here is JWT-authed and scoped to req.user.id server-side.
 */
import { apiClient, ApiError } from "@/services/api/httpClient";
import type {
  ApiAvailability, ApiBooking, ApiBookingWithPlan, ApiConsentNotice, ApiConsentState, ApiDamage,
  ApiDeposit, ApiDocument, ApiEarlyRecharge, ApiInvoice, ApiKycSummary, ApiMaintenanceNotice,
  ApiMaintenanceRecord, ApiMe, ApiNotification, ApiOverdueLateFee, ApiOverdueLateFeeInvoice,
  ApiPaymentOrder, ApiPlanQuote, ApiRental, ApiReturnSettlement, ApiReturnStage, ApiSignedUrl,
  ApiStation, ApiSupportRequest, ApiUserDetail, ApiVehicleModel, ApiVehicleModelDetail,
  ConsentPurpose, CreateBookingOrderPayload, CreateSupportRequestPayload, KycDocType,
  ListVehicleModelsParams, MaintenanceHistoryParams, Paginated, ReturnRequestPayload,
  UpdateUserPayload, VerifyPaymentPayload,
} from "../types/api";

type Query = Record<string, string | number | boolean | undefined>;

async function nullOn404<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const riderApi = {
  // --- users ------------------------------------------------------------
  me: () => apiClient.get<ApiMe>("/users/me"),
  updateMe: (patch: UpdateUserPayload) => apiClient.patch<ApiUserDetail>("/users/me", patch),
  uploadMyPhoto: (file: File) => {
    const form = new FormData();
    form.append("photo", file, file.name);
    return apiClient.postForm<{ profile_photo_url: string }>("/users/me/photo", form);
  },
  myPhotoUrl: () => apiClient.get<ApiSignedUrl>("/users/me/photo/url"),

  // --- notifications ---------------------------------------------------
  myNotifications: (params: { page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<ApiNotification>>("/users/me/notifications", params as Query),
  unreadNotificationCount: () =>
    apiClient.get<{ count: number }>("/users/me/notifications/unread-count"),
  markNotificationRead: (id: string) =>
    apiClient.patch<ApiNotification>(`/users/me/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    apiClient.post<void>("/users/me/notifications/read-all"),

  // --- rider KYC -----------------------------------------------------
  myKyc: () => apiClient.get<ApiKycSummary>("/users/me/kyc"),
  uploadMyDocument: (input: {
    doc_type: KycDocType;
    doc_number: string;
    expires_on?: string;
    front: File;
    back?: File;
  }) => {
    const form = new FormData();
    form.append("doc_type", input.doc_type);
    form.append("doc_number", input.doc_number);
    if (input.expires_on) form.append("expires_on", input.expires_on);
    form.append("front", input.front, input.front.name);
    if (input.back) form.append("back", input.back, input.back.name);
    return apiClient.postForm<ApiDocument>("/users/me/kyc/documents", form);
  },
  updateMyDocument: (
    documentId: string,
    input: { doc_number?: string; expires_on?: string; front?: File; back?: File },
  ) => {
    const form = new FormData();
    if (input.doc_number) form.append("doc_number", input.doc_number);
    if (input.expires_on) form.append("expires_on", input.expires_on);
    if (input.front) form.append("front", input.front, input.front.name);
    if (input.back) form.append("back", input.back, input.back.name);
    return apiClient.postForm<ApiDocument>(`/users/me/kyc/documents/${documentId}`, form);
  },
  deleteMyDocument: (documentId: string) =>
    apiClient.delete<void>(`/users/me/kyc/documents/${documentId}`),
  myDocumentUrl: (documentId: string, side: "front" | "back" = "front") =>
    apiClient.get<ApiSignedUrl>(`/users/me/kyc/documents/${documentId}/url`, { side }),
  submitMyKyc: () => apiClient.post<ApiKycSummary>("/users/me/kyc/submit"),

  // --- vehicle catalog ------------------------------------------------
  listVehicleModels: (params: ListVehicleModelsParams = {}) =>
    apiClient.get<Paginated<ApiVehicleModel>>("/vehicle-models", params as Query),
  featuredVehicleModel: () => nullOn404(apiClient.get<ApiVehicleModel>("/vehicle-models/featured")),
  fleetAvailabilitySummary: () =>
    apiClient.get<{ available_count: number }>("/vehicle-models/availability-summary"),
  getVehicleModel: (id: string) => apiClient.get<ApiVehicleModelDetail>(`/vehicle-models/${id}`),
  vehicleModelAvailability: (id: string, stationId?: string) =>
    apiClient.get<ApiAvailability>(`/vehicle-models/${id}/availability`, { stationId }),

  // --- bookings -----------------------------------------------------
  /**
   * Pay-first checkout: creates a payment_orders "booking intent" only. No
   * booking exists until this order's payment captures and the backend
   * materialises it. Retrying the same plan/date reuses the one open intent.
   */
  createBookingOrder: (payload: CreateBookingOrderPayload) =>
    apiClient.post<ApiPaymentOrder>("/payments/bookings/order", payload),
  myCurrentBooking: () => nullOn404(apiClient.get<ApiBookingWithPlan>("/bookings/me/current")),
  myBookingById: (bookingId: string) =>
    apiClient.get<ApiBookingWithPlan>(`/bookings/me/${bookingId}`),
  cancelBooking: (bookingId: string, reason?: string) =>
    apiClient.post<ApiBooking>(`/bookings/${bookingId}/cancel`, reason ? { reason } : {}),
  bookingHistory: (params: { page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<ApiBooking>>("/bookings/me/history", params as Query),
  requestEarlyRecharge: (bookingId: string) =>
    apiClient.post<ApiEarlyRecharge>(`/bookings/me/${bookingId}/recharge`),
  nearestStation: (lat: number, lng: number) =>
    apiClient.get<ApiStation>("/stations/nearest", { lat, lng }),

  // --- payments ------------------------------------------------------
  createPaymentOrderForBooking: (bookingId: string) =>
    apiClient.post<ApiPaymentOrder>(`/payments/bookings/${bookingId}/order`),
  quotePlan: (planId: string, startDay?: string) =>
    apiClient.get<ApiPlanQuote>(
      `/payments/plans/${planId}/quote`,
      startDay ? { start_day: startDay } : undefined,
    ),
  createPaymentOrderForInvoice: (invoiceId: string) =>
    apiClient.post<ApiPaymentOrder>(`/payments/invoices/${invoiceId}/order`),
  verifyPayment: (payload: VerifyPaymentPayload) =>
    apiClient.post<{ status: string }>("/payments/verify", payload),

  // --- rider billing -----------------------------------------------
  myInvoices: (params: { page?: number; pageSize?: number; bookingId?: string } = {}) =>
    apiClient.get<Paginated<ApiInvoice>>("/invoices/me", params as Query),
  myDepositForBooking: (bookingId: string) =>
    nullOn404(apiClient.get<ApiDeposit>(`/deposits/me/booking/${bookingId}`)),
  myDamagesForBooking: (bookingId: string) =>
    apiClient.get<ApiDamage[]>("/damages/me", { bookingId }),
  disputeDamage: (damageId: string, reason: string) =>
    apiClient.post<ApiDamage>(`/damages/${damageId}/dispute`, { reason }),

  // --- rentals -----------------------------------------------------
  myCurrentRental: () => nullOn404(apiClient.get<ApiRental>("/rentals/me/current")),
  requestRentalReturn: (rentalId: string, body: ReturnRequestPayload) =>
    apiClient.post<ApiRental>(`/rentals/${rentalId}/return-request`, body),
  rentalHistory: (params: { page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<ApiRental>>("/rentals/me/history", params as Query),
  myRentalSettlement: () =>
    apiClient.get<ApiReturnSettlement | null>("/rentals/me/settlement"),
  myOverdueLateFee: () => apiClient.get<ApiOverdueLateFee>("/rentals/me/overdue-late-fee"),
  payMyOverdueLateFee: () =>
    apiClient.post<ApiOverdueLateFeeInvoice>("/rentals/me/overdue-late-fee"),
  myReturnStage: () => apiClient.get<ApiReturnStage | null>("/rentals/me/return-stage"),

  // --- maintenance -----------------------------------------------
  maintenanceHistory: (params: MaintenanceHistoryParams = {}) =>
    apiClient.get<Paginated<ApiMaintenanceRecord>>("/maintenance/me/history", params as Query),
  maintenanceNotice: () =>
    apiClient.get<ApiMaintenanceNotice | null>("/maintenance/me/notice"),

  // --- DPDPA consent -------------------------------------------
  consentNotice: (lang: "en" | "ta" = "en") =>
    apiClient.get<ApiConsentNotice>("/consent/notice", { lang }),
  myConsents: () => apiClient.get<ApiConsentState>("/users/me/consents"),
  setConsents: (input: {
    notice_version: string;
    language: "en" | "ta";
    grants: { purpose: ConsentPurpose; granted: boolean }[];
  }) => apiClient.post<ApiConsentState>("/users/me/consents", input),
  withdrawConsent: (purpose: ConsentPurpose) =>
    apiClient.delete<ApiConsentState>(`/users/me/consents/${purpose}`),

  // --- support ---------------------------------------------------
  createSupportRequest: (payload: CreateSupportRequestPayload) =>
    apiClient.post<ApiSupportRequest>("/users/me/support", payload),
  mySupportRequests: (params: { page?: number; pageSize?: number } = {}) =>
    apiClient.get<Paginated<ApiSupportRequest>>("/users/me/support", params as Query),
};

export { ApiError };
