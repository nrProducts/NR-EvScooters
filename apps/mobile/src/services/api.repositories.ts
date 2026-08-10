import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import { getSupabase } from '../lib/supabase';
import type {
    ApiAvailability, ApiBooking, ApiDamage, ApiDeposit, ApiDocument, ApiInvoice, ApiKycSummary,
    ApiMaintenanceNotice, ApiMaintenanceRecord, ApiMe, ApiNotification, ApiPaymentOrder, ApiReferralSummary,
    ApiRental, ApiSignedUrl, ApiStation, ApiSupportRequest, ApiUserDetail, ApiVehicleModel,
    ApiVehicleModelDetail, CreateBookingPayload, CreateSupportRequestPayload, ListVehicleModelsParams,
    MaintenanceHistoryParams, Paginated, ReturnRequestPayload, UpdateUserPayload, VerifyPaymentPayload,
} from '../types/api';
import type {
    AuthRepository, BillingRepository, BookingRepository, HistoryParams, KycRepository,
    MaintenanceRepository, NotificationRepository, ReferralRepository,
    RentalRepository, SessionRef, SupportRepository, UpdateDocumentInput,
    UploadDocumentInput, UploadPhotoResult, UserRepository, VehicleCatalogRepository,
} from './types';
import type { LocalFile } from '../types/api';

/**
 * Thin adapters over the HTTP client. They exist so screens depend on the
 * repository interface rather than on `api` directly — which is what makes the
 * mock swap a one-line change instead of a refactor.
 */

export class SupabaseAuthRepository implements AuthRepository {
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

    signOut(): Promise<void> {
        return api.signOutEverywhere();
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
    registerPushToken(token: string): Promise<void> {
        return api.registerPushToken(token);
    }
}

export class ApiNotificationRepository implements NotificationRepository {
    list(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiNotification>> {
        return api.myNotifications(params);
    }
    async unreadCount(): Promise<number> {
        return (await api.unreadNotificationCount()).count;
    }
    markRead(id: string): Promise<ApiNotification> {
        return api.markNotificationRead(id);
    }
    markAllRead(): Promise<void> {
        return api.markAllNotificationsRead();
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
}

export class ApiVehicleCatalogRepository implements VehicleCatalogRepository {
    list(params: ListVehicleModelsParams): Promise<Paginated<ApiVehicleModel>> {
        return api.listVehicleModels(params);
    }
    async featured(): Promise<ApiVehicleModel | null> {
        try {
            return await api.featuredVehicleModel();
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        }
    }
    get(id: string): Promise<ApiVehicleModelDetail> {
        return api.getVehicleModel(id);
    }
    availabilitySummary(): Promise<{ available_count: number }> {
        return api.fleetAvailabilitySummary();
    }
    availability(id: string, stationId?: string): Promise<ApiAvailability> {
        return api.vehicleModelAvailability(id, stationId);
    }
}

export class ApiBookingRepository implements BookingRepository {
    create(payload: CreateBookingPayload): Promise<ApiBooking> {
        return api.createBooking(payload);
    }
    async mine(): Promise<ApiBooking | null> {
        try {
            return await api.myCurrentBooking();
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        }
    }
    cancel(bookingId: string, reason?: string): Promise<ApiBooking> {
        return api.cancelBooking(bookingId, reason);
    }
    history(params: HistoryParams): Promise<Paginated<ApiBooking>> {
        return api.bookingHistory(params);
    }
    nearestStation(lat: number, lng: number): Promise<ApiStation> {
        return api.nearestStation(lat, lng);
    }
}

export class ApiBillingRepository implements BillingRepository {
    createOrderForBooking(bookingId: string): Promise<ApiPaymentOrder> {
        return api.createPaymentOrderForBooking(bookingId);
    }
    createOrderForInvoice(invoiceId: string): Promise<ApiPaymentOrder> {
        return api.createPaymentOrderForInvoice(invoiceId);
    }
    async verifyPayment(payload: VerifyPaymentPayload): Promise<void> {
        await api.verifyPayment(payload);
    }
    myInvoices(params: HistoryParams & { bookingId?: string }): Promise<Paginated<ApiInvoice>> {
        return api.myInvoices(params);
    }
    async myDeposit(bookingId: string): Promise<ApiDeposit | null> {
        try {
            return await api.myDepositForBooking(bookingId);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        }
    }
    myDamages(bookingId: string): Promise<ApiDamage[]> {
        return api.myDamagesForBooking(bookingId);
    }
    disputeDamage(damageId: string, reason: string): Promise<ApiDamage> {
        return api.disputeDamage(damageId, reason);
    }
}

export class ApiRentalRepository implements RentalRepository {
    async mine(): Promise<ApiRental | null> {
        try {
            return await api.myCurrentRental();
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
        }
    }
    history(params: HistoryParams): Promise<Paginated<ApiRental>> {
        return api.rentalHistory(params);
    }
    requestReturn(rentalId: string, payload: ReturnRequestPayload): Promise<ApiRental> {
        return api.requestRentalReturn(rentalId, payload);
    }
}

export class ApiMaintenanceRepository implements MaintenanceRepository {
    history(params?: MaintenanceHistoryParams): Promise<Paginated<ApiMaintenanceRecord>> {
        return api.maintenanceHistory(params);
    }
    notice(): Promise<ApiMaintenanceNotice | null> {
        return api.maintenanceNotice();
    }
}

export class ApiSupportRepository implements SupportRepository {
    create(payload: CreateSupportRequestPayload): Promise<ApiSupportRequest> {
        return api.createSupportRequest(payload);
    }
    mine(params: HistoryParams): Promise<Paginated<ApiSupportRequest>> {
        return api.mySupportRequests(params);
    }
}

export class ApiReferralRepository implements ReferralRepository {
    mine(): Promise<ApiReferralSummary> {
        return api.myReferralSummary();
    }
    async redeem(code: string): Promise<void> {
        await api.redeemReferralCode(code);
    }
}
