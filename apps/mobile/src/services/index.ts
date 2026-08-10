import {
    ApiBillingRepository, ApiBookingRepository, ApiKycRepository, ApiMaintenanceRepository,
    ApiNotificationRepository, ApiReferralRepository, ApiRentalRepository, ApiSupportRepository,
    ApiUserRepository, ApiVehicleCatalogRepository, SupabaseAuthRepository,
} from './api.repositories';
import type {
    AuthRepository, BillingRepository, BookingRepository, KycRepository, MaintenanceRepository,
    NotificationRepository, ReferralRepository, RentalRepository, SupportRepository,
    UserRepository, VehicleCatalogRepository,
} from './types';

/**
 * The only place the app decides where data comes from. Everything downstream
 * — hooks, screens, the auth store — talks to these interfaces.
 *
 * There is deliberately no in-app mock mode: the app always talks to the real
 * backend, so a build with a missing .env fails loudly instead of silently
 * shipping fake data. The in-memory implementations still exist as test
 * fixtures under tests/fixtures/mock/, unreachable from app code.
 */
export const authRepository: AuthRepository = new SupabaseAuthRepository();

export const userRepository: UserRepository = new ApiUserRepository();

export const kycRepository: KycRepository = new ApiKycRepository();

export const vehicleCatalogRepository: VehicleCatalogRepository = new ApiVehicleCatalogRepository();

export const bookingRepository: BookingRepository = new ApiBookingRepository();

export const billingRepository: BillingRepository = new ApiBillingRepository();

export const notificationRepository: NotificationRepository = new ApiNotificationRepository();

export const rentalRepository: RentalRepository = new ApiRentalRepository();

export const maintenanceRepository: MaintenanceRepository = new ApiMaintenanceRepository();

export const supportRepository: SupportRepository = new ApiSupportRepository();

export const referralRepository: ReferralRepository = new ApiReferralRepository();

export type {
    AuthRepository, BookingRepository, KycRepository, MaintenanceRepository,
    NotificationRepository, ReferralRepository, RentalRepository, SupportRepository, UserRepository,
    VehicleCatalogRepository, SessionRef,
} from './types';
