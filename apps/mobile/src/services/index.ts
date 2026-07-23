import { ENV } from '../constants/env';
import {
    ApiBookingRepository, ApiKycRepository, ApiNotificationRepository, ApiRentalRepository,
    ApiUserRepository, ApiVehicleCatalogRepository, SupabaseAuthRepository,
} from './api.repositories';
import {
    MockAuthRepository, MockBookingRepository, MockKycRepository, MockNotificationRepository,
    MockRentalRepository, MockUserRepository, MockVehicleCatalogRepository,
} from './mock/mock.repositories';
import type {
    AuthRepository, BookingRepository, KycRepository, NotificationRepository, RentalRepository,
    UserRepository, VehicleCatalogRepository,
} from './types';

/**
 * The only place the app decides where data comes from. Everything downstream
 * — hooks, screens, the auth store — talks to these interfaces and cannot tell
 * the difference.
 *
 * Flip EXPO_PUBLIC_USE_MOCK in apps/mobile/.env, restart Metro with -c.
 */
export const authRepository: AuthRepository = ENV.useMock
    ? new MockAuthRepository()
    : new SupabaseAuthRepository();

export const userRepository: UserRepository = ENV.useMock
    ? new MockUserRepository()
    : new ApiUserRepository();

export const kycRepository: KycRepository = ENV.useMock
    ? new MockKycRepository()
    : new ApiKycRepository();

export const vehicleCatalogRepository: VehicleCatalogRepository = ENV.useMock
    ? new MockVehicleCatalogRepository()
    : new ApiVehicleCatalogRepository();

export const bookingRepository: BookingRepository = ENV.useMock
    ? new MockBookingRepository()
    : new ApiBookingRepository();

export const notificationRepository: NotificationRepository = ENV.useMock
    ? new MockNotificationRepository()
    : new ApiNotificationRepository();

export const rentalRepository: RentalRepository = ENV.useMock
    ? new MockRentalRepository()
    : new ApiRentalRepository();

if (ENV.useMock && __DEV__) {
    console.info(
        '[services] MOCK MODE — in-memory data, no backend. ' +
        'Set EXPO_PUBLIC_USE_MOCK=false in apps/mobile/.env to use the real API.',
    );
}

export { DEMO_ACCOUNTS } from './mock/seed';
export { resetMockDb } from './mock/mock.repositories';
export type {
    AuthRepository, BookingRepository, KycRepository, NotificationRepository, RentalRepository,
    UserRepository, VehicleCatalogRepository, SessionRef,
} from './types';
