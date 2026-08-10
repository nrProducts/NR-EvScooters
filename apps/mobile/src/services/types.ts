import type {
    ApiAvailability, ApiBooking, ApiDamage, ApiDeposit, ApiDocument, ApiInvoice, ApiKycSummary,
    ApiMaintenanceNotice, ApiMaintenanceRecord, ApiMe, ApiNotification, ApiPaymentOrder, ApiReferralSummary,
    ApiRental, ApiSignedUrl, ApiStation, ApiSupportRequest, ApiUserDetail, ApiVehicleModel,
    ApiVehicleModelDetail, CreateBookingPayload, CreateSupportRequestPayload, KycDocType,
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
    expiry_date?: string;
    front: LocalFile;
    back?: LocalFile;
}

export interface UpdateDocumentInput {
    doc_number?: string;
    expiry_date?: string;
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
    create(payload: CreateBookingPayload): Promise<ApiBooking>;
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
    createOrderForBooking(bookingId: string): Promise<ApiPaymentOrder>;
    createOrderForInvoice(invoiceId: string): Promise<ApiPaymentOrder>;
    verifyPayment(payload: VerifyPaymentPayload): Promise<void>;

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
