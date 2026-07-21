import type {
    ApiDocument, ApiKycDetail, ApiKycQueueItem, ApiKycSummary, ApiMe, ApiSignedUrl,
    ApiUser, ApiUserDetail, CreateUserPayload, KycDocType, KycStatus, ListUsersParams,
    LocalFile, Paginated, RoleName, StatusAction, UpdateUserPayload,
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
