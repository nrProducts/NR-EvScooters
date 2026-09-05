import type {
  BillingCycle, BookingRefundStatus, BookingStatus, DepositStatus, KycStatus, KycDocType, MaintenanceStatus,
  InvoicePaymentState, PlanStatus, RentalStatus, SupportStatus, VerificationStatus, VehicleStatus,
} from '../types/api';
import type { CopyKey } from '../i18n';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

/**
 * Enum value → display label, and enum value → colour tone.
 *
 * The `*_LABEL` maps hold TRANSLATION KEYS, not text — the rename from the
 * old `*_LABEL` (which held English strings) to `*_LABEL_KEY` is deliberate
 * and is why every call site had to be touched: a map that silently changed
 * from strings to keys would have shipped `status.booking.confirmed` to
 * riders as a badge label, and the compiler could not have told the two
 * apart. Read them as `t(BOOKING_STATUS_LABEL_KEY[booking.status])`.
 *
 * The `*_TONE` maps are unchanged. A colour has no language.
 *
 * The enum values on the left are the API's, and stay exactly as the API
 * spells them — nothing here translates, normalises or re-cases a value that
 * goes back over the wire.
 */

/** The unit a plan's price is quoted in — "₹2499 / Month". */
export const BILLING_CYCLE_LABEL_KEY: Record<BillingCycle, CopyKey> = {
  daily: 'status.billingCycle.daily',
  weekly: 'status.billingCycle.weekly',
  monthly: 'status.billingCycle.monthly',
  yearly: 'status.billingCycle.yearly',
};

export const KYC_STATUS_TONE: Record<KycStatus, Tone> = {
  not_submitted: 'neutral',
  pending: 'warning',
  partially_verified: 'primary',
  verified: 'success',
  rejected: 'danger',
};

/** Enum values are snake_case; these resolve to what a human should read. */
export const KYC_STATUS_LABEL_KEY: Record<KycStatus, CopyKey> = {
  not_submitted: 'status.kyc.not_submitted',
  pending: 'status.kyc.pending',
  partially_verified: 'status.kyc.partially_verified',
  verified: 'status.kyc.verified',
  rejected: 'status.kyc.rejected',
};

export const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

/**
 * Per-document verification state.
 *
 * There was no label map for this before, so the KYC screen rendered the raw
 * enum value into the badge — a rider saw the literal `pending`. That was a
 * bug in English and would have been a worse one in Tamil, where an
 * untranslated lowercase Latin word next to translated copy reads as a
 * failure rather than as a status.
 *
 * Shares the `status.kyc.*` strings: these three states mean the same thing
 * to a rider as the account-level ones, and two sets of words for one idea is
 * how a UI starts contradicting itself.
 */
export const VERIFICATION_LABEL_KEY: Record<VerificationStatus, CopyKey> = {
  pending: 'status.kyc.pending',
  verified: 'status.kyc.verified',
  rejected: 'status.kyc.rejected',
};

/**
 * Document names. "Aadhaar" is a proper noun and stays Aadhaar in all three
 * languages — transliterated into the local script, not translated, because
 * it is the name printed on the card the rider is holding.
 */
export const DOC_TYPE_LABEL_KEY: Record<KycDocType, CopyKey> = {
  aadhaar: 'status.docType.aadhaar',
  driving_licence: 'status.docType.driving_licence',
  passport: 'status.docType.passport',
  voter_id: 'status.docType.voter_id',
  address_proof: 'status.docType.address_proof',
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  pending_payment: 'warning',
  confirmed: 'primary',
  fulfilled: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  expired: 'neutral',
};

export const BOOKING_STATUS_LABEL_KEY: Record<BookingStatus, CopyKey> = {
  pending_payment: 'status.booking.pending_payment',
  confirmed: 'status.booking.confirmed',
  fulfilled: 'status.booking.fulfilled',
  completed: 'status.booking.completed',
  cancelled: 'status.booking.cancelled',
  expired: 'status.booking.expired',
};

// `cancelled` is gone from `rental_status`: a rental that never really
// happened is a booking that was cancelled, and no rental row exists for it.
export const RENTAL_STATUS_TONE: Record<RentalStatus, Tone> = {
  active: 'primary',
  completed: 'success',
  force_ended: 'warning',
};

export const RENTAL_STATUS_LABEL_KEY: Record<RentalStatus, CopyKey> = {
  active: 'status.rental.active',
  completed: 'status.rental.completed',
  force_ended: 'status.rental.force_ended',
};

export const MAINTENANCE_STATUS_TONE: Record<MaintenanceStatus, Tone> = {
  reported: 'warning',
  // New: someone has looked at it and decided what happens next, which is
  // materially different from nobody having looked yet.
  triaged: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  cancelled: 'neutral',
};

export const MAINTENANCE_STATUS_LABEL_KEY: Record<MaintenanceStatus, CopyKey> = {
  reported: 'status.maintenance.reported',
  triaged: 'status.maintenance.triaged',
  in_progress: 'status.maintenance.in_progress',
  resolved: 'status.maintenance.resolved',
  cancelled: 'status.maintenance.cancelled',
};

export const SUPPORT_STATUS_TONE: Record<SupportStatus, Tone> = {
  open: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  closed: 'neutral',
};

export const SUPPORT_STATUS_LABEL_KEY: Record<SupportStatus, CopyKey> = {
  open: 'status.support.open',
  in_progress: 'status.support.in_progress',
  resolved: 'status.support.resolved',
  closed: 'status.support.closed',
};

export const REFUND_STATUS_TONE: Record<BookingRefundStatus, Tone> = {
  pending: 'warning',
  processing: 'warning',
  processed: 'success',
  not_required: 'neutral',
  failed: 'danger',
};

export const REFUND_STATUS_LABEL_KEY: Record<BookingRefundStatus, CopyKey> = {
  pending: 'status.refund.pending',
  processing: 'status.refund.processing',
  processed: 'status.refund.processed',
  not_required: 'status.refund.not_required',
  failed: 'status.refund.failed',
};

export const DEPOSIT_STATUS_TONE: Record<DepositStatus, Tone> = {
  pending: 'neutral',
  held: 'primary',
  released: 'success',
  forfeited: 'danger',
};

// "Released" rather than "Refunded": the deposit is no longer held, and how
// much actually came back is the refund's business — the rider sees the
// amount on the refund itself, which is the only place it is now recorded.
export const DEPOSIT_STATUS_LABEL_KEY: Record<DepositStatus, CopyKey> = {
  pending: 'status.deposit.pending',
  held: 'status.deposit.held',
  released: 'status.deposit.released',
  forfeited: 'status.deposit.forfeited',
};

export const VEHICLE_STATUS_TONE: Record<VehicleStatus, Tone> = {
  available: 'success',
  reserved: 'warning',
  assigned: 'primary',
  maintenance: 'neutral',
  retired: 'danger',
};

export const VEHICLE_STATUS_LABEL_KEY: Record<VehicleStatus, CopyKey> = {
  available: 'status.vehicle.available',
  reserved: 'status.vehicle.reserved',
  assigned: 'status.vehicle.assigned',
  maintenance: 'status.vehicle.maintenance',
  retired: 'status.vehicle.retired',
};

/**
 * An invoice's payment state, as billing.tsx shows it. Tone is unchanged from
 * before this file's translation pass: 'overdue' reads RED like Home's
 * "Plan expired" banner — the two screens describe one situation, not two
 * severities of it — and 'partial' stays amber because money has genuinely
 * arrived, there is just some left.
 */
export const PAYMENT_STATE_TONE: Record<InvoicePaymentState, 'success' | 'warning' | 'danger' | undefined> = {
  paid: 'success', partial: 'warning', overdue: 'danger', unpaid: undefined,
};

export const PAYMENT_STATE_LABEL_KEY: Record<InvoicePaymentState, CopyKey> = {
  paid: 'status.paymentState.paid',
  partial: 'status.paymentState.partial',
  overdue: 'status.paymentState.overdue',
  unpaid: 'status.paymentState.unpaid',
};

export const PAYMENT_METHOD_LABEL_KEY: Record<'upi' | 'card' | 'netbanking' | 'wallet' | 'cash', CopyKey> = {
  upi: 'status.paymentMethod.upi',
  card: 'status.paymentMethod.card',
  netbanking: 'status.paymentMethod.netbanking',
  wallet: 'status.paymentMethod.wallet',
  cash: 'status.paymentMethod.cash',
};

/** `bookings.plan_status` — the subscription's recurring-billing state. */
export const PLAN_STATUS_LABEL_KEY: Record<PlanStatus, CopyKey> = {
  active: 'status.planStatus.active',
  past_due: 'status.planStatus.past_due',
  paused: 'status.planStatus.paused',
};

/**
 * Deliberately NOT language-aware.
 *
 * `undefined` as the locale means "the device's own regional format", which
 * is the correct behaviour and the one the spec asks for: a rider who reads
 * Tamil still lives in India, still pays in rupees, and still expects
 * 05 Sep 2026 on a date. Language and regional formatting are separate
 * settings, and switching the app to Hindi must not silently restyle every
 * date, amount and number on the screen.
 *
 * If per-language date formatting is ever genuinely wanted, it belongs behind
 * its own setting, not behind this one.
 */
export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
