import type {
    ApiAvailability, ApiBooking, ApiDamage, ApiDeposit, ApiDocument, ApiEarlyRecharge, ApiInvoice, ApiKycSummary,
    ApiMaintenanceNotice, ApiMaintenanceRecord, ApiMe, ApiNotification, ApiOverdueLateFee, ApiOverdueLateFeeInvoice,
    ApiPaymentOrder, ApiPlanQuote, ApiReferralSummary,
    ApiRental, ApiReturnSettlement, ApiReturnStage, ApiSignedUrl, ApiStation, ApiSupportRequest, ApiUserDetail, ApiVehicleModel,
    ApiVehicleModelDetail, CreateBookingOrderPayload, CreateSupportRequestPayload, KycDocType,
    ListVehicleModelsParams, LocalFile, MaintenanceHistoryParams, Paginated, ReturnRequestPayload,
    UpdateUserPayload, VerifyPaymentPayload,
} from '../types/api';

export interface UploadPhotoResult {
    profile_photo_url: string;
}

/**
 * The seam. Screens depend on these interfaces, never on fetch or on Supabase.
 * Two implementations exist — one talking to the real API, one in-memory — and
 * they are interchangeable because both honour the same contract, including
 * which errors they throw.
 */

export interface UserRepository {
    me(): Promise<ApiMe>;
    updateMe(patch: UpdateUserPayload): Promise<ApiUserDetail>;
    uploadMyPhoto(photo: LocalFile): Promise<UploadPhotoResult>;
    myPhotoUrl(): Promise<ApiSignedUrl>;
    registerPushToken(token: string): Promise<void>;
}

export interface NotificationRepository {
    list(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiNotification>>;
    unreadCount(): Promise<number>;
    markRead(id: string): Promise<ApiNotification>;
    markAllRead(): Promise<void>;
}

export interface UploadDocumentInput {
    doc_type: KycDocType;
    doc_number: string;
    expires_on?: string;
    front: LocalFile;
    back?: LocalFile;
}

export interface UpdateDocumentInput {
    doc_number?: string;
    expires_on?: string;
    front?: LocalFile;
    back?: LocalFile;
}

export interface KycRepository {
    mine(): Promise<ApiKycSummary>;
    uploadMine(input: UploadDocumentInput): Promise<ApiDocument>;
    updateMine(documentId: string, input: UpdateDocumentInput): Promise<ApiDocument>;
    deleteMine(documentId: string): Promise<void>;
    myDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl>;
    submitMine(): Promise<ApiKycSummary>;
}

export interface VehicleCatalogRepository {
    list(params: ListVehicleModelsParams): Promise<Paginated<ApiVehicleModel>>;
    featured(): Promise<ApiVehicleModel | null>;
    get(id: string): Promise<ApiVehicleModelDetail>;
    availabilitySummary(): Promise<{ available_count: number }>;
    /** Station-scoped when stationId is given; fleet-wide for the model otherwise. */
    availability(id: string, stationId?: string): Promise<ApiAvailability>;
}

export interface ReferralRepository {
    mine(): Promise<ApiReferralSummary>;
    redeem(code: string): Promise<void>;
}

export interface HistoryParams {
    page?: number;
    pageSize?: number;
}

export interface BookingRepository {
    /**
     * The rider's current in-progress booking, or null if none exists. The
     * real implementation's object actually carries the plan/billing fields
     * too (ApiBookingWithPlan extends ApiBooking) — screens that need them
     * cast the result rather than widening this shared interface, since the
     * mock fixture (tests/fixtures/mock) doesn't simulate the billing engine.
     */
    mine(): Promise<ApiBooking | null>;
    /**
     * A specific one of the rider's own bookings, by id — unlike mine()
     * (pending_payment/confirmed only), this also serves a 'fulfilled' one,
     * which is what Billing needs to keep reading plan_status/next_due_at
     * once the rider has been picked up. Same cast convention as mine().
     */
    byId(bookingId: string): Promise<ApiBooking>;
    /** All of the rider's own bookings, any status, most recent first. */
    history(params: HistoryParams): Promise<Paginated<ApiBooking>>;
    /** Rider-initiated pre-pickup cancellation. Returns the cancelled booking with its refund fields. */
    cancel(bookingId: string, reason?: string): Promise<ApiBooking>;
    nearestStation(lat: number, lng: number): Promise<ApiStation>;
}

/**
 * Payment gateway + rider billing. Amounts always come from the order the
 * backend hands back — this repository never accepts one as input.
 */
export interface BillingRepository {
    /**
     * Itemised price for a plan BEFORE any booking exists. Read-only —
     * creates no booking, subscription or invoice.
     *
     * The app cannot compute this: pricing rules live in the database.
     */
    quotePlan(planId: string, startDay?: string): Promise<ApiPlanQuote>;
    /**
     * Pay-first booking checkout. Creates ONLY a payment intent — no booking,
     * subscription or invoice. The booking is materialised by the backend when
     * this order's payment captures. Retrying with the same plan/date reuses
     * the one open intent.
     */
    createBookingOrder(payload: CreateBookingOrderPayload): Promise<ApiPaymentOrder>;
    /** Legacy — pays an admin-created `pending_payment` booking. */
    createOrderForBooking(bookingId: string): Promise<ApiPaymentOrder>;
    createOrderForInvoice(invoiceId: string): Promise<ApiPaymentOrder>;
    verifyPayment(payload: VerifyPaymentPayload): Promise<void>;
    /** Opens on the last day of the current plan — pay the upcoming period ahead of the overdue-lock, starting right after the current one ends. */
    requestEarlyRecharge(bookingId: string): Promise<ApiEarlyRecharge>;

    myInvoices(params: HistoryParams & { bookingId?: string }): Promise<Paginated<ApiInvoice>>;
    /** The rider's deposit for a booking, or null before one exists (booking not yet paid). */
    myDeposit(bookingId: string): Promise<ApiDeposit | null>;
    myDamages(bookingId: string): Promise<ApiDamage[]>;
    disputeDamage(damageId: string, reason: string): Promise<ApiDamage>;
}

export interface RentalRepository {
    /** The rider's current active rental, or null if none exists. */
    mine(): Promise<ApiRental | null>;
    /** All of the rider's own rentals, most recent first. */
    history(params: HistoryParams): Promise<Paginated<ApiRental>>;
    /**
     * Asks to hand the scooter back. Does NOT end the rental — it stays
     * active until staff confirm the physical handover.
     */
    requestReturn(rentalId: string, payload: ReturnRequestPayload): Promise<ApiRental>;
    /** The rider's most recent return settlement, or null if none exists. Powers the Home/My Scooter settlement card. */
    settlement(): Promise<ApiReturnSettlement | null>;
    /** Pure preview of the overdue renewal late fee — safe on every screen load, creates nothing. */
    overdueLateFee(): Promise<ApiOverdueLateFee>;
    /** Creates (or reuses) the payable invoice for the overdue late fee — pay it via billingRepository.createOrderForInvoice. */
    payOverdueLateFee(): Promise<ApiOverdueLateFeeInvoice>;
    /** Vehicle Return → Inspection → Payment Gate → Approve Return, from the rider's own side. Null once there's no return to report on. */
    returnStage(): Promise<ApiReturnStage | null>;
}

export interface MaintenanceRepository {
    /**
     * Maintenance events for vehicles the rider has personally rented, scoped
     * server-side to tickets raised from their pickup onward. Pass `vehicleId`
     * to narrow to a single scooter.
     */
    history(params?: MaintenanceHistoryParams): Promise<Paginated<ApiMaintenanceRecord>>;
    /** The rider's own currently-open displacement ticket, if any — drives the Home screen banner. */
    notice(): Promise<ApiMaintenanceNotice | null>;
}

export interface SupportRepository {
    create(payload: CreateSupportRequestPayload): Promise<ApiSupportRequest>;
    /** The rider's own submitted requests, most recent first. */
    mine(params: HistoryParams): Promise<Paginated<ApiSupportRequest>>;
}

/** Identity of the signed-in account, before roles are resolved. */
export interface SessionRef {
    id: string;
    email: string | null;
}

export interface AuthRepository {
    /** Reads any persisted session. Null when signed out. */
    restore(): Promise<SessionRef | null>;

    // --- phone OTP (primary) --------------------------------------------
    /** Ask the provider to send a one-time code to this E.164 number. */
    requestPhoneOtp(phone: string): Promise<void>;
    /** Verify the code; resolves to the established session on success. */
    verifyPhoneOtp(phone: string, code: string): Promise<SessionRef>;

    // --- Google (secondary / recovery) ----------------------------------
    signInWithGoogle(): Promise<SessionRef>;

    signOut(): Promise<void>;
    /** Fires on external session changes (token refresh, expiry). */
    subscribe(onChange: (ref: SessionRef | null) => void): () => void;
}
