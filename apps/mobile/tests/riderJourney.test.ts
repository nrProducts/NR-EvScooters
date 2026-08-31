import { describe, expect, it } from 'vitest';
import { deriveRiderPhase, type RiderJourneyInput } from '../src/lib/riderJourney';
import type { ApiBooking, ApiRental, ApiReturnSettlement } from '../src/types/api';

const NONE: RiderJourneyInput = { pendingBooking: null, activeRental: null, settlement: null };

type Prof = Parameters<typeof deriveRiderPhase>[0];
const profile = (over: Partial<NonNullable<Prof>> = {}): NonNullable<Prof> => ({
  can_rent: false,
  kyc_status: 'not_submitted',
  has_active_booking: false,
  has_active_rental: false,
  ...over,
});

describe('deriveRiderPhase', () => {
  it('is loading until the profile lands', () => {
    expect(deriveRiderPhase(null, NONE)).toBe('loading');
  });

  it('sends a fresh rider to KYC', () => {
    expect(deriveRiderPhase(profile({ kyc_status: 'not_submitted' }), NONE)).toBe('kyc_required');
    expect(deriveRiderPhase(profile({ kyc_status: 'rejected' }), NONE)).toBe('kyc_required');
  });

  it('shows "under review" while KYC is being checked', () => {
    expect(deriveRiderPhase(profile({ kyc_status: 'pending' }), NONE)).toBe('kyc_in_review');
    expect(deriveRiderPhase(profile({ kyc_status: 'partially_verified' }), NONE)).toBe('kyc_in_review');
  });

  it('lets a verified rider with nothing booked discover + book', () => {
    expect(deriveRiderPhase(profile({ can_rent: true, kyc_status: 'verified' }), NONE)).toBe('ready_to_book');
  });

  it('flags an unpaid booking as payment_pending, not active', () => {
    const pendingBooking = { status: 'pending_payment' } as ApiBooking;
    expect(deriveRiderPhase(profile({ can_rent: true, has_active_booking: true }), { ...NONE, pendingBooking }))
      .toBe('payment_pending');
  });

  it('treats a confirmed booking as pickup_scheduled', () => {
    const pendingBooking = { status: 'confirmed' } as ApiBooking;
    expect(deriveRiderPhase(profile({ can_rent: true, has_active_booking: true }), { ...NONE, pendingBooking }))
      .toBe('pickup_scheduled');
  });

  it('active rental outranks a stale has_active_booking flag', () => {
    expect(deriveRiderPhase(
      profile({ can_rent: true, has_active_booking: true, has_active_rental: true }),
      { ...NONE, activeRental: {} as ApiRental },
    )).toBe('active_rental');
  });

  it('surfaces a due settlement after the rental ends', () => {
    const settlement = { status: 'amount_due', due_amount: 500 } as ApiReturnSettlement;
    expect(deriveRiderPhase(profile({ can_rent: true }), { ...NONE, settlement })).toBe('rental_completed');
  });
});
