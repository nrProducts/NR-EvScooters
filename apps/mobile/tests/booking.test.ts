import { beforeEach, describe, expect, it } from 'vitest';
import { buildMapsUrl, buildWebMapsUrl } from '../src/lib/maps';
import { getNextDays, isValidStartDay } from '../src/lib/bookingDays';
import {
  MockAuthRepository, MockBookingRepository, MockUserRepository, resetMockDb,
} from '../src/services/mock/mock.repositories';
import { ApiError } from '../src/lib/ApiError';

const fmt = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function nextDow(targetDow: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== targetDow) d.setDate(d.getDate() + 1);
  return d;
}

describe('buildMapsUrl', () => {
  it('builds a geo: URI on Android', () => {
    expect(buildMapsUrl(9.9312, 76.2673, 'android')).toBe('geo:9.9312,76.2673?q=9.9312,76.2673');
  });

  it('builds an Apple Maps URL on iOS', () => {
    expect(buildMapsUrl(9.9312, 76.2673, 'ios')).toBe('https://maps.apple.com/?daddr=9.9312,76.2673');
  });
});

describe('buildWebMapsUrl', () => {
  it('builds a cross-platform Google Maps web URL for the no-app fallback', () => {
    expect(buildWebMapsUrl(9.9312, 76.2673)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=9.9312,76.2673',
    );
  });
});

describe('isValidStartDay', () => {
  it('rejects a Sunday', () => {
    expect(isValidStartDay(fmt(nextDow(0)))).toBe(false);
  });

  it('accepts Monday through Saturday in the future', () => {
    for (let dow = 1; dow <= 6; dow++) {
      expect(isValidStartDay(fmt(nextDow(dow, new Date(Date.now() + 24 * 3600 * 1000))))).toBe(true);
    }
  });

  it('rejects a date in the past', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 1);
    expect(isValidStartDay(fmt(yesterday))).toBe(false);
  });
});

describe('getNextDays', () => {
  it('returns the requested count of consecutive days starting today', () => {
    const days = getNextDays(14);
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe(fmt(new Date()));
  });

  it('marks every Sunday as disabled and every other day as enabled', () => {
    const days = getNextDays(14);
    for (const day of days) {
      expect(day.disabled).toBe(day.weekday === 'Sun');
    }
  });
});

const auth = new MockAuthRepository();
const users = new MockUserRepository();
const bookings = new MockBookingRepository();

const asVerifiedRider = () => auth.signIn('rider@fleet.com', ''); // u-rider-001: both docs verified
const asUnverifiedRider = () => auth.signIn('fatima.s@example.com', ''); // u-rider-003: partially_verified

const VALID_PAYLOAD = () => ({
  vehicle_model_id: 'model-nr-volt-x1',
  station_id: 'station-mg-road-hub',
  plan_id: 'plan-daily',
  start_day: fmt(nextDow(1, new Date(Date.now() + 24 * 3600 * 1000))), // next Monday-or-later
});

beforeEach(async () => {
  resetMockDb();
});

describe('MockBookingRepository.create', () => {
  it('creates a pending_payment booking for a KYC-verified rider', async () => {
    await asVerifiedRider();
    const booking = await bookings.create(VALID_PAYLOAD());
    expect(booking.status).toBe('pending_payment');
    expect(booking.vehicle_model?.id).toBe('model-nr-volt-x1');
    expect(booking.station?.id).toBe('station-mg-road-hub');
    expect(booking.plan?.id).toBe('plan-daily');
  });

  it('refuses to create a booking for a rider without verified KYC', async () => {
    await asUnverifiedRider();
    await expect(bookings.create(VALID_PAYLOAD())).rejects.toBeInstanceOf(ApiError);
    await bookings.create(VALID_PAYLOAD()).catch((e: ApiError) => expect(e.status).toBe(403));
  });

  it('rejects a Sunday start day', async () => {
    await asVerifiedRider();
    const payload = { ...VALID_PAYLOAD(), start_day: fmt(nextDow(0)) };
    await expect(bookings.create(payload)).rejects.toBeInstanceOf(ApiError);
    await bookings.create(payload).catch((e: ApiError) => expect(e.status).toBe(422));
  });

  it('rejects a past start day', async () => {
    await asVerifiedRider();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const payload = { ...VALID_PAYLOAD(), start_day: fmt(yesterday) };
    await expect(bookings.create(payload)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('MockBookingRepository.mine', () => {
  it('returns null when the rider has no booking', async () => {
    await asVerifiedRider();
    expect(await bookings.mine()).toBeNull();
  });

  it('returns the booking just created', async () => {
    await asVerifiedRider();
    const created = await bookings.create(VALID_PAYLOAD());
    const mine = await bookings.mine();
    expect(mine?.id).toBe(created.id);
  });
});

describe('has_active_booking (feeds useHasActiveBooking)', () => {
  it('is false before any booking exists', async () => {
    await asVerifiedRider();
    const me = await users.me();
    expect(me.has_active_booking).toBe(false);
  });

  it('is true once a pending_payment booking exists', async () => {
    await asVerifiedRider();
    await bookings.create(VALID_PAYLOAD());
    const me = await users.me();
    expect(me.has_active_booking).toBe(true);
  });
});
