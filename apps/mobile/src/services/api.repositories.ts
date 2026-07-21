import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import { getSupabase } from '../lib/supabase';
import type {
    ApiDocument, ApiKycDetail, ApiKycQueueItem, ApiKycSummary, ApiMe, ApiSignedUrl,
    ApiUser, ApiUserDetail, CreateUserPayload, ListUsersParams, Paginated, RoleName,
    StatusAction, UpdateUserPayload,
} from '../types/api';
import type {
    AuthRepository, KycQueueParams, KycRepository, SessionRef, UpdateDocumentInput,
    UploadDocumentInput, UploadPhotoResult, UserRepository,
} from './types';
import type { LocalFile } from '../types/api';

/**
 * Thin adapters over the HTTP client. They exist so screens depend on the
 * repository interface rather than on `api` directly — which is what makes the
 * mock swap a one-line change instead of a refactor.
 */

export class SupabaseAuthRepository implements AuthRepository {
    readonly requiresPassword = true;
    readonly isMock = false;

    async restore(): Promise<SessionRef | null> {
        const { data } = await getSupabase().auth.getSession();
        if (!data.session) return null;
        return { id: data.session.user.id, email: data.session.user.email ?? null };
    }

    async requestPhoneOtp(phone: string): Promise<void> {
        await api.requestPhoneOtp(phone);
    }

    async verifyPhoneOtp(phone: string, code: string): Promise<SessionRef> {
        await api.verifyPhoneOtp(phone, code);
        const ref = await this.restore();
        if (!ref) throw new ApiError(401, 'UNAUTHENTICATED', 'Verification succeeded but no session was returned.');
        return ref;
    }

    async signInWithGoogle(): Promise<SessionRef> {
        await api.signInWithGoogle();
        const ref = await this.restore();
        if (!ref) throw new ApiError(401, 'UNAUTHENTICATED', 'Google sign-in succeeded but no session was returned.');
        return ref;
    }

    async signIn(email: string, password: string): Promise<SessionRef> {
        await api.signIn(email, password);
        const ref = await this.restore();
        if (!ref) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign-in succeeded but no session was returned.');
        return ref;
    }

    signOut(): Promise<void> {
        return api.signOutEverywhere();
    }

    sendPasswordReset(email: string): Promise<void> {
        return api.sendPasswordReset(email);
    }

    subscribe(onChange: (ref: SessionRef | null) => void): () => void {
        const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
            onChange(session ? { id: session.user.id, email: session.user.email ?? null } : null);
        });
        return () => data.subscription.unsubscribe();
    }
}

export class ApiUserRepository implements UserRepository {
    me(): Promise<ApiMe> {
        return api.me();
    }
    updateMe(patch: UpdateUserPayload): Promise<ApiUserDetail> {
        return api.updateMe(patch);
    }
    uploadMyPhoto(photo: LocalFile): Promise<UploadPhotoResult> {
        return api.uploadMyPhoto(photo);
    }
    myPhotoUrl(): Promise<ApiSignedUrl> {
        return api.myPhotoUrl();
    }
    list(params: ListUsersParams): Promise<Paginated<ApiUser>> {
        return api.listUsers(params);
    }
    get(id: string): Promise<ApiUserDetail> {
        return api.getUser(id);
    }
    create(payload: CreateUserPayload): Promise<ApiUserDetail> {
        return api.createUser(payload);
    }
    update(id: string, patch: UpdateUserPayload): Promise<ApiUserDetail> {
        return api.updateUser(id, patch);
    }
    remove(id: string): Promise<void> {
        return api.deleteUser(id);
    }
    restore(id: string): Promise<ApiUserDetail> {
        return api.restoreUser(id);
    }
    changeStatus(id: string, action: StatusAction, reason?: string): Promise<ApiUserDetail> {
        return api.changeStatus(id, action, reason);
    }
    async getRoles(id: string): Promise<RoleName[]> {
        return (await api.getRoles(id)).roles;
    }
    async setRoles(id: string, roles: RoleName[]): Promise<RoleName[]> {
        return (await api.setRoles(id, roles)).roles;
    }
}

export class ApiKycRepository implements KycRepository {
    mine(): Promise<ApiKycSummary> {
        return api.myKyc();
    }
    uploadMine(input: UploadDocumentInput): Promise<ApiDocument> {
        return api.uploadMyDocument(input);
    }
    updateMine(documentId: string, input: UpdateDocumentInput): Promise<ApiDocument> {
        return api.updateMyDocument(documentId, input);
    }
    deleteMine(documentId: string): Promise<void> {
        return api.deleteMyDocument(documentId);
    }
    myDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl> {
        return api.myDocumentUrl(documentId, side);
    }
    submitMine(): Promise<ApiKycSummary> {
        return api.submitMyKyc();
    }
    queue(params: KycQueueParams): Promise<Paginated<ApiKycQueueItem>> {
        return api.listKyc(params);
    }
    detail(userId: string): Promise<ApiKycDetail> {
        return api.getKycDetail(userId);
    }
    reviewDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl> {
        return api.reviewDocumentUrl(documentId, side);
    }
    verifyDocument(documentId: string): Promise<ApiDocument> {
        return api.verifyDocument(documentId);
    }
    rejectDocument(documentId: string, reason: string): Promise<ApiDocument> {
        return api.rejectDocument(documentId, reason);
    }
    approve(userId: string): Promise<ApiKycSummary> {
        return api.approveKyc(userId);
    }
    reject(userId: string, reason: string): Promise<ApiKycSummary> {
        return api.rejectKyc(userId, reason);
    }
}
