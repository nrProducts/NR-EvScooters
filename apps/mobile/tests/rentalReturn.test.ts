import { beforeEach, describe, expect, it } from 'vitest';
import {
  LATE_RETURN_FEE_PER_DAY, MAX_LATE_PENALTY_DAYS,
  computeLateReturnPenalty, returnDeadlineFor,
} from '../src/lib/returnPolicy';
import {
  MockAuthRepository, MockBookingRepository, MockRentalRepository, MockUserRepository,
  resetMockDb,
} from '../src/services/mock/mock.repositories';
import { ApiError } from '../src/lib/ApiError';

/**
 * The policy block below is deliberately the SAME fixture table as
 * apps/backend/tests/rentalReturnPolicy.test.ts. The mobile copy of the rule
 * exists only so the rider sees the deadline and fee before submitting; if the
 * two ever drift, one of these suites fails.
 */

const at = (offsetDays: number, h = 12, m = 0, s = 0, ms = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, s, ms);
  return d;
};

const dueAt = (offsetDays: number): string => returnDeadlineFor(at(offsetDays)).toISOString();

describe('returnDeadlineFor', () => {
  it('lands on the last millisecond of the same local day', () => {
    const due = returnDeadlineFor(at(0, 9, 30));
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
    expect(due.getSeconds()).toBe(59);
    expect(due.getMilliseconds()).toBe(999);
  });

  it('is the same instant whether requested at midnight or just before midnight', () => {
    expect(returnDeadlineFor(at(0, 0, 0, 0, 0)).getTime())
      .toBe(returnDeadlineFor(at(0, 23, 59, 59, 0)).getTime());
  });
});

describe('computeLateReturnPenalty — on time', () => {
  it('is free when handed over in the morning of the due day', () => {
    const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(0, 9) });
    expect(c.daysLate).toBe(0);
    expect(c.isLate).toBe(false);
    expect(c.penaltyAmount).toBe(0);
    expect(c.hadRequest).toBe(true);
  });

  it('is free right up to the last second of the due day', () => {
    const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(0, 23, 59, 59) });
    expect(c.daysLate).toBe(0);
  });

  it('never goes negative when the handover precedes the deadline', () => {
    const c = computeLateReturnPenalty({ returnDueAt: dueAt(1), now: at(0, 12) });
    expect(c.daysLate).toBe(0);
    expect(c.penaltyAmount).toBe(0);
  });
});

describe('computeLateReturnPenalty — late', () => {
  it('charges one day the moment the clock rolls past midnight', () => {
    const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(1, 0, 0, 30) });
    expect(c.daysLate).toBe(1);
    expect(c.penaltyAmount).toBe(LATE_RETURN_FEE_PER_DAY);
  });

  it('scales with whole days late', () => {
    const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(2, 8) });
    expect(c.daysLate).toBe(2);
    expect(c.penaltyAmount).toBe(2 * LATE_RETURN_FEE_PER_DAY);
  });

  it('caps an abandoned rental rather than accruing without bound', () => {
    const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(365) });
    expect(c.daysLate).toBe(MAX_LATE_PENALTY_DAYS);
  });
});

describe('computeLateReturnPenalty — no request to be late against', () => {
  it('charges nothing when there was never a return request', () => {
    const c = computeLateReturnPenalty({ returnDueAt: null, now: at(30) });
    expect(c.hadRequest).toBe(false);
    expect(c.penaltyAmount).toBe(0);
  });

  it('fails open on an unparseable deadline rather than charging', () => {
    const c = computeLateReturnPenalty({ returnDueAt: 'not-a-date', now: at(30) });
    expect(c.hadRequest).toBe(false);
    expect(c.penaltyAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Mock repository flow
// ---------------------------------------------------------------------------

const auth = new MockAuthRepository();
const users = new MockUserRepository();
const bookings = new MockBookingRepository();
const rentals = new MockRentalRepository();

const asVerifiedRider = () => auth.signIn('rider@fleet.com', '');
const asStaff = () => auth.signIn('staff@fleet.com', '');

const fmt = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Books, then has staff confirm pickup, leaving the rider on an active rental. */
async function startRental(): Promise<string> {
  await asVerifiedRider();
  const start = new Date(Date.now() + 24 * 3600 * 1000);
  while (start.getDay() === 0) start.setDate(start.getDate() + 1);
  const booking = await bookings.create({
    vehicle_model_id: 'model-nr-volt-x1',
    station_id: 'station-mg-road-hub',
    plan_id: 'plan-daily',
    start_day: fmt(start),
  });

  await asStaff();
  await bookings.confirmPickup(booking.id, 'mock-vehicle-1');

  await asVerifiedRider();
  const rental = await rentals.mine();
  return rental!.id;
}

beforeEach(async () => {
  resetMockDb();
});

describe('MockRentalRepository.requestReturn', () => {
  it('records the request without ending the rental', async () => {
    const rentalId = await startRental();

    const updated = await rentals.requestReturn(rentalId, {
      reason: 'plan_ended', feedback: 'All good', rating: 5,
    });

    // The scooter is still physically with the rider until staff confirm.
    expect(updated.status).toBe('active');
    expect(updated.return_requested_at).not.toBeNull();
    expect(updated.return_due_at).not.toBeNull();
    expect(updated.return_reason).toBe('plan_ended');
  });

  it('keeps has_active_rental true so the rider cannot book another scooter', async () => {
    const rentalId = await startRental();
    await rentals.requestReturn(rentalId, { reason: 'plan_ended', rating: 4 });

    // Regression guard: me() derives this from assigned_vehicle, which the
    // return request must NOT clear.
    expect((await users.me()).has_active_rental).toBe(true);
    expect((await rentals.mine())?.id).toBe(rentalId);
  });

  it('refuses a second request on the same rental', async () => {
    const rentalId = await startRental();
    await rentals.requestReturn(rentalId, { reason: 'plan_ended', rating: 4 });

    await expect(rentals.requestReturn(rentalId, { reason: 'moving_away', rating: 3 }))
      .rejects.toBeInstanceOf(ApiError);
    await rentals.requestReturn(rentalId, { reason: 'moving_away', rating: 3 })
      .catch((e: ApiError) => expect(e.status).toBe(409));
  });

  it("404s on another rider's rental rather than confirming it exists", async () => {
    const rentalId = await startRental();

    await auth.signIn('fatima.s@example.com', '');
    await expect(rentals.requestReturn(rentalId, { reason: 'plan_ended', rating: 4 }))
      .rejects.toBeInstanceOf(ApiError);
    await rentals.requestReturn(rentalId, { reason: 'plan_ended', rating: 4 })
      .catch((e: ApiError) => expect(e.status).toBe(404));
  });

  it('404s on an unknown rental id', async () => {
    await asVerifiedRider();
    await rentals.requestReturn('does-not-exist', { reason: 'plan_ended', rating: 4 })
      .catch((e: ApiError) => expect(e.status).toBe(404));
  });

  it('sets a deadline of end-of-day today', async () => {
    const rentalId = await startRental();
    const updated = await rentals.requestReturn(rentalId, { reason: 'switching_plan', rating: 5 });

    const due = new Date(updated.return_due_at!);
    expect(due.getDate()).toBe(new Date().getDate());
    expect(due.getHours()).toBe(23);
    // Nothing is owed yet on the day of the request.
    expect(computeLateReturnPenalty({ returnDueAt: updated.return_due_at }).penaltyAmount).toBe(0);
  });

  it('still appears in history with its return fields', async () => {
    const rentalId = await startRental();
    await rentals.requestReturn(rentalId, { reason: 'too_expensive', feedback: 'Pricey', rating: 2 });

    const history = await rentals.history({});
    const row = history.data.find((r) => r.id === rentalId);
    expect(row?.return_reason).toBe('too_expensive');
    expect(row?.return_feedback).toBe('Pricey');
  });
});
