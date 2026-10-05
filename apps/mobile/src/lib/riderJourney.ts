import { shouldShowSettlement } from './settlementDisplay';
import type { ApiBooking, ApiMe, ApiRental, ApiReturnSettlement } from '../types/api';

/**
 * The rider's place in the rental journey. Home renders ONE primary card off
 * `phase` instead of a stack of ad-hoc ternaries, and quick actions grey out
 * the irrelevant ones.
 *
 * Pure — no React, no API calls, no store. Kept in lib/ (not the hook file)
 * so it can be unit-tested without pulling in react-native.
 *
 *   kyc_required     — can't rent, KYC not started or a document was rejected
 *   kyc_in_review    — can't rent, KYC submitted and under review
 *   ready_to_book    — verified, nothing booked or rented — the discovery state
 *   payment_pending  — a booking exists but its payment was never completed
 *   pickup_scheduled — booking confirmed, waiting for staff handover
 *   active_rental    — scooter picked up; plan is live
 *   rental_completed — no live rental, but a recent return settlement to show
 */
export type RiderPhase =
  | 'loading'
  | 'kyc_required'
  | 'kyc_in_review'
  | 'ready_to_book'
  | 'payment_pending'
  | 'pickup_scheduled'
  | 'active_rental'
  | 'rental_completed';

export interface RiderJourney {
  phase: RiderPhase;
  /** True only in `ready_to_book` — gates the Book quick action and discovery. */
  canBook: boolean;
}

export interface RiderJourneyInput {
  pendingBooking: ApiBooking | null;
  activeRental: ApiRental | null;
  settlement: ApiReturnSettlement | null;
}

type JourneyProfile = Pick<ApiMe, 'can_rent' | 'kyc_status' | 'has_active_booking' | 'has_active_rental'>;

export function deriveRiderPhase(
  profile: JourneyProfile | null,
  { pendingBooking, activeRental, settlement }: RiderJourneyInput,
): RiderPhase {
  if (!profile) return 'loading';

  // A live rental outranks everything — has_active_rental takes priority over
  // has_active_booking the moment pickup happens (see home.tsx).
  if (profile.has_active_rental || activeRental) return 'active_rental';

  if (profile.has_active_booking) {
    // pendingBooking may still be loading; treat an unknown booking as
    // "scheduled" rather than flashing a payment prompt that may not apply.
    return pendingBooking?.status === 'pending_payment' ? 'payment_pending' : 'pickup_scheduled';
  }

  if (!profile.can_rent) {
    return profile.kyc_status === 'pending' || profile.kyc_status === 'partially_verified'
      ? 'kyc_in_review'
      : 'kyc_required';
  }

  if (shouldShowSettlement(settlement)) return 'rental_completed';

  return 'ready_to_book';
}
