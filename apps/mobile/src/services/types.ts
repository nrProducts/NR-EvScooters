import type {
    ApiAvailableVehicle, ApiBooking, ApiDocument, ApiKycDetail, ApiKycQueueItem, ApiKycSummary,
    ApiMaintenanceRecord, ApiMe, ApiNotification, ApiPickupBooking, ApiReferralSummary, ApiRental,
    ApiSignedUrl, ApiStation, ApiSupportQueueItem, ApiSupportRequest, ApiUser, ApiUserDetail,
    ApiVehicleModel, ApiVehicleModelDetail, CreateBookingPayload, CreateSupportRequestPayload,
    CreateUserPayload, KycDocType, KycStatus, ListUsersParams, ListVehicleModelsParams, LocalFile,
    Paginated, RoleName, StatusAction, SupportStatus, UpdateSupportRequestPayload, UpdateUserPayload,
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
    list(params: ListUsersParams): Promise<Paginated<ApiUser>>;
    get(id: string): Promise<ApiUserDetail>;
    create(payload: CreateUserPayload): Promise<ApiUserDetail>;
    update(id: string, patch: UpdateUserPayload): Promise<ApiUserDetail>;
    remove(id: string): Promise<void>;
    restore(id: string): Promise<ApiUserDetail>;
    changeStatus(id: string, action: StatusAction, reason?: string): Promise<ApiUserDetail>;
    getRoles(id: string): Promise<RoleName[]>;
    setRoles(id: string, roles: RoleName[]): Promise<RoleName[]>;
    registerPushToken(token: string): Promise<void>;
}

export interface NotificationRepository {
    list(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiNotification>>;
    unreadCount(): Promise<number>;
    markRead(id: string): Promise<ApiNotification>;
    markAllRead(): Promise<void>;
}

export interface KycQueueParams {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: KycStatus;
    docType?: KycDocType;
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
    // rider
    mine(): Promise<ApiKycSummary>;
    uploadMine(input: UploadDocumentInput): Promise<ApiDocument>;
    updateMine(documentId: string, input: UpdateDocumentInput): Promise<ApiDocument>;
    deleteMine(documentId: string): Promise<void>;
    myDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl>;
    submitMine(): Promise<ApiKycSummary>;

    // staff
    queue(params: KycQueueParams): Promise<Paginated<ApiKycQueueItem>>;
    detail(userId: string): Promise<ApiKycDetail>;
    reviewDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl>;
    verifyDocument(documentId: string): Promise<ApiDocument>;
    rejectDocument(documentId: string, reason: string): Promise<ApiDocument>;
    approve(userId: string): Promise<ApiKycSummary>;
    reject(userId: string, reason: string): Promise<ApiKycSummary>;
}

export interface VehicleCatalogRepository {
    list(params: ListVehicleModelsParams): Promise<Paginated<ApiVehicleModel>>;
    featured(): Promise<ApiVehicleModel | null>;
    get(id: string): Promise<ApiVehicleModelDetail>;
    availabilitySummary(): Promise<{ available_count: number }>;
}

export interface ReferralRepository {
    mine(): Promise<ApiReferralSummary>;
    redeem(code: string): Promise<void>;
}

export interface PickupQueueParams {
    page?: number;
    pageSize?: number;
    stationId?: string;
}

export interface HistoryParams {
    page?: number;
    pageSize?: number;
}

export interface BookingRepository {
    create(payload: CreateBookingPayload): Promise<ApiBooking>;
    /** The rider's current in-progress booking, or null if none exists. */
    mine(): Promise<ApiBooking | null>;
    /** All of the rider's own bookings, any status, most recent first. */
    history(params: HistoryParams): Promise<Paginated<ApiBooking>>;
    nearestStation(lat: number, lng: number): Promise<ApiStation>;

    // staff pickup/check-in
    pickupQueue(params: PickupQueueParams): Promise<Paginated<ApiPickupBooking>>;
    availableVehicles(bookingId: string): Promise<ApiAvailableVehicle[]>;
    confirmPickup(bookingId: string, vehicleId: string): Promise<ApiPickupBooking>;
}

export interface RentalRepository {
    /** The rider's current active rental, or null if none exists. */
    mine(): Promise<ApiRental | null>;
    /** All of the rider's own rentals, most recent first. */
    history(params: HistoryParams): Promise<Paginated<ApiRental>>;
}

export interface MaintenanceRepository {
    /** Maintenance events for vehicles the rider has personally rented. */
    history(): Promise<Paginated<ApiMaintenanceRecord>>;
}

export interface SupportQueueParams {
    page?: number;
    pageSize?: number;
    status?: SupportStatus;
}

export interface SupportRepository {
    create(payload: CreateSupportRequestPayload): Promise<ApiSupportRequest>;
    /** The rider's own submitted requests, most recent first. */
    mine(params: HistoryParams): Promise<Paginated<ApiSupportRequest>>;

    // staff
    queue(params: SupportQueueParams): Promise<Paginated<ApiSupportQueueItem>>;
    detail(id: string): Promise<ApiSupportQueueItem>;
    update(id: string, patch: UpdateSupportRequestPayload): Promise<ApiSupportQueueItem>;
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

    // --- email/password (admin surface + demo) --------------------------
    signIn(email: string, password: string): Promise<SessionRef>;
    sendPasswordReset(email: string): Promise<void>;

    signOut(): Promise<void>;
    /** Fires on external session changes (token refresh, expiry). */
    subscribe(onChange: (ref: SessionRef | null) => void): () => void;
    /** Mock mode has no password field to show. */
    readonly requiresPassword: boolean;
    /** Mock mode fakes OTP/Google; real mode talks to Supabase. */
    readonly isMock: boolean;
}
