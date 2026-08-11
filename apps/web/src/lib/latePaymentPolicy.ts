/**
 * Admin-side mirror of the weekly-due late-payment rule, so the Bookings
 * grid can show the same overdue/late-fee info the rider's app shows them.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/payments/billing.constants.ts
 *   apps/backend/src/modules/payments/payments.service.ts -> createOrderForInvoice
 *
 * The server always recomputes authoritatively when a payment order is
 * created; this is a display estimate, computed in the ADMIN'S browser-local
 * time (a third clock alongside the server's and the DB's UTC) — acceptable
 * only because it's a display estimate, same convention as
 * apps/mobile/src/lib/latePaymentPolicy.ts.
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
 * dueDate is a DATE-only string (bookings.next_due_at). Paid any time on the
 * due day -> 0 days late; the day after -> 1.
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
