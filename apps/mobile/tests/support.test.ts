import { beforeEach, describe, expect, it } from 'vitest';
import {
  MockBookingRepository, MockSupportRepository, mockSupportContext, resetMockDb, signInAs, startMockRental,
} from './fixtures/mock/mock.repositories';
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

const bookings = new MockBookingRepository();
const support = new MockSupportRepository();

const asVerifiedRider = () => signInAs('rider@fleet.com'); // u-rider-001
/** Matches startMockRental's default, so the attach assertion has a target. */
const VEHICLE_ID = 'mock-vehicle-1';

const VALID_BOOKING_PAYLOAD = () => ({
  vehicle_model_id: 'model-nr-volt-x1',
  station_id: 'station-mg-road-hub',
  plan_id: 'plan-daily',
  start_day: fmt(nextDow(1, new Date(Date.now() + 24 * 3600 * 1000))),
});

const VALID_TICKET = () => ({
  subject: 'Scooter beeping',
  description: 'The scooter keeps beeping even after I locked it.',
});

beforeEach(() => {
  resetMockDb();
});

describe('MockSupportRepository.create', () => {
  it('creates an open, medium-priority request for a signed-in rider', async () => {
    await asVerifiedRider();
    const req = await support.create(VALID_TICKET());
    expect(req.status).toBe('open');
    expect(req.priority).toBe('medium');
    expect(req.subject).toBe('Scooter beeping');
  });

  it('rejects when nobody is signed in', async () => {
    await expect(support.create(VALID_TICKET())).rejects.toBeInstanceOf(ApiError);
  });

  it('leaves rental context null when the rider has no active rental', async () => {
    await asVerifiedRider();
    const req = await support.create(VALID_TICKET());
    const ctx = mockSupportContext(req.id);
    expect(ctx.rental_id).toBeNull();
    expect(ctx.vehicle_id).toBeNull();
  });

  it("auto-attaches the rider's active rental context", async () => {
    await asVerifiedRider();
    const booking = await bookings.create(VALID_BOOKING_PAYLOAD());
    startMockRental(booking.id, VEHICLE_ID);

    const req = await support.create(VALID_TICKET());

    const ctx = mockSupportContext(req.id);
    expect(ctx.vehicle_id).toBe(VEHICLE_ID);
    expect(ctx.rental_id).not.toBeNull();
  });
});

describe('MockSupportRepository.mine', () => {
  it("returns only the signed-in rider's own requests, most recent first", async () => {
    await asVerifiedRider();
    await support.create({ subject: 'First issue', description: 'This happened first, chronologically.' });
    const second = await support.create({ subject: 'Second issue', description: 'This happened second, chronologically.' });

    const mine = await support.mine({ page: 1, pageSize: 20 });
    expect(mine.data).toHaveLength(2);
    expect(mine.data[0].id).toBe(second.id);
  });

  it("does not return another rider's requests", async () => {
    await asVerifiedRider();
    await support.create(VALID_TICKET());

    await signInAs('fatima.s@example.com');
    const mine = await support.mine({ page: 1, pageSize: 20 });
    expect(mine.data).toHaveLength(0);
  });
});
