import { beforeEach, describe, expect, it } from 'vitest';
import {
  MockAuthRepository, MockBookingRepository, MockSupportRepository, resetMockDb,
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

const auth = new MockAuthRepository();
const bookings = new MockBookingRepository();
const support = new MockSupportRepository();

const asVerifiedRider = () => auth.signIn('rider@fleet.com', ''); // u-rider-001
const asStaff = () => auth.signIn('staff@fleet.com', '');

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
    await asStaff();
    const detail = await support.detail(req.id);
    expect(detail.rental_id).toBeNull();
    expect(detail.vehicle_id).toBeNull();
  });

  it("auto-attaches the rider's active rental context", async () => {
    await asVerifiedRider();
    const booking = await bookings.create(VALID_BOOKING_PAYLOAD());

    await asStaff();
    const vehicles = await bookings.availableVehicles(booking.id);
    await bookings.confirmPickup(booking.id, vehicles[0].id);

    await asVerifiedRider();
    const req = await support.create(VALID_TICKET());

    await asStaff();
    const detail = await support.detail(req.id);
    expect(detail.vehicle_id).toBe(vehicles[0].id);
    expect(detail.rental_id).not.toBeNull();
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

    await auth.signIn('fatima.s@example.com', '');
    const mine = await support.mine({ page: 1, pageSize: 20 });
    expect(mine.data).toHaveLength(0);
  });
});

describe('MockSupportRepository staff flow', () => {
  it('queue lists every rider\'s requests and can filter by status', async () => {
    await asVerifiedRider();
    const req = await support.create(VALID_TICKET());

    await asStaff();
    const all = await support.queue({ page: 1, pageSize: 20 });
    expect(all.data.some((r) => r.id === req.id)).toBe(true);

    const openOnly = await support.queue({ page: 1, pageSize: 20, status: 'open' });
    expect(openOnly.data.every((r) => r.status === 'open')).toBe(true);

    const resolvedOnly = await support.queue({ page: 1, pageSize: 20, status: 'resolved' });
    expect(resolvedOnly.data.some((r) => r.id === req.id)).toBe(false);
  });

  it('update advances status, sets resolved_at, and claims an unassigned ticket for the acting staff member', async () => {
    await asVerifiedRider();
    const req = await support.create(VALID_TICKET());

    const staffRef = await asStaff();
    const updated = await support.update(req.id, { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
    expect(updated.assigned_to).toBe(staffRef.id);
    expect(updated.resolved_at).toBeNull();

    const resolved = await support.update(req.id, { status: 'resolved' });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved_at).not.toBeNull();
  });

  it('a rider cannot update a ticket (staff-only action)', async () => {
    await asVerifiedRider();
    const req = await support.create(VALID_TICKET());
    await expect(support.update(req.id, { status: 'closed' })).rejects.toBeInstanceOf(ApiError);
  });
});
