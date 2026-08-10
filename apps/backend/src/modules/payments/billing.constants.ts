/**
 * Single source of truth for weekly-due late-payment tuning — imported by
 * payments.service.ts. Mirrored (deliberately, with a pointer comment) in
 * apps/mobile/src/lib/latePaymentPolicy.ts so the rider can be shown the
 * running late fee before paying, not just after.
 */

/**
 * Charged per full day a weekly-due 'rental' invoice remains unpaid past its
 * due_date, computed fresh every time an order is created for it — never
 * stored, so it naturally compounds the longer a rider waits without a
 * separate job needing to update it daily.
 */
export const LATE_PAYMENT_FEE_PER_DAY = 300;
