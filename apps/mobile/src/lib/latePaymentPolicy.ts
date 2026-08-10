/**
 * Client-side mirror of the weekly-due late-payment rule so the rider can be
 * shown the running late fee before paying.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/payments/billing.constants.ts
 *   apps/backend/src/modules/payments/payments.service.ts -> createOrderForInvoice
 *
 * The server always recomputes authoritatively when the order is created;
 * this is a display estimate, computed in DEVICE-local time (a third clock
 * alongside the server's and the DB's UTC) — acceptable only because it's an
 * estimate. Always render the server-returned order amount for what's
 * actually charged, never the locally guessed one.
 */

/** Flat fee, in rupees, per WHOLE CALENDAR DAY a weekly-due invoice sits unpaid past its due date. */
export const LATE_PAYMENT_FEE_PER_DAY = 300;

export interface LatePaymentCharge {
  daysLate: number;
  isLate: boolean;
  feePerDay: number;
  lateFeeAmount: number;
}

/**
 * dueDate is a DATE-only string (invoices.due_date / bookings.next_due_at).
 * Paid any time on the due day -> 0 days late; the day after -> 1.
 */
export function computeLatePaymentFee(dueDate: string | null, now: Date = new Date()): LatePaymentCharge {
  const feePerDay = LATE_PAYMENT_FEE_PER_DAY;
  if (!dueDate) return { daysLate: 0, isLate: false, feePerDay, lateFeeAmount: 0 };

  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { daysLate: 0, isLate: false, feePerDay, lateFeeAmount: 0 };

  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Math.round rather than floor: a DST shift makes the gap 23 or 25 hours,
  // which would otherwise slide the boundary by a whole day.
  const rawDaysLate = Math.round((today.getTime() - dueDay.getTime()) / 86_400_000);
  const daysLate = Math.max(0, rawDaysLate);

  return {
    daysLate,
    isLate: daysLate > 0,
    feePerDay,
    lateFeeAmount: Math.round(daysLate * feePerDay * 100) / 100,
  };
}
