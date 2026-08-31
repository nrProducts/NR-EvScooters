/**
 * Ported verbatim from apps/mobile/src/constants/status.ts — keep in sync.
 * Label + tone maps for rider-facing enums.
 */
import type {
  BillingCycle, BookingRefundStatus, BookingStatus, DepositStatus, KycStatus, KycDocType, MaintenanceStatus,
  RentalStatus, SupportStatus, VerificationStatus, VehicleStatus,
} from '../types/api';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  daily: 'Day',
  weekly: 'Week',
  monthly: 'Month',
  yearly: 'Year',
};

export const KYC_STATUS_TONE: Record<KycStatus, Tone> = {
  not_submitted: 'neutral',
  pending: 'warning',
  partially_verified: 'primary',
  verified: 'success',
  rejected: 'danger',
};

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  not_submitted: 'Not Submitted',
  pending: 'Pending',
  partially_verified: 'Partly Verified',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  pending: 'warning',
  verified: 'success',
  rejected: 'danger',
};

export const DOC_TYPE_LABEL: Record<KycDocType, string> = {
  aadhaar: 'Aadhaar',
  driving_licence: 'Driving Licence',
  passport: 'Passport',
  voter_id: 'Voter ID',
  address_proof: 'Address Proof',
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  pending_payment: 'warning',
  confirmed: 'primary',
  fulfilled: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  expired: 'neutral',
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  fulfilled: 'Picked Up',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const RENTAL_STATUS_TONE: Record<RentalStatus, Tone> = {
  active: 'primary',
  completed: 'success',
  force_ended: 'warning',
};

export const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  force_ended: 'Force Ended',
};

export const MAINTENANCE_STATUS_TONE: Record<MaintenanceStatus, Tone> = {
  reported: 'warning',
  triaged: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  cancelled: 'neutral',
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  reported: 'Reported',
  triaged: 'Triaged',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
};

export const SUPPORT_STATUS_TONE: Record<SupportStatus, Tone> = {
  open: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  closed: 'neutral',
};

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const REFUND_STATUS_TONE: Record<BookingRefundStatus, Tone> = {
  pending: 'warning',
  processing: 'warning',
  processed: 'success',
  not_required: 'neutral',
  failed: 'danger',
};

export const REFUND_STATUS_LABEL: Record<BookingRefundStatus, string> = {
  pending: 'Awaiting Approval',
  processing: 'Refund Initiated',
  processed: 'Refunded',
  not_required: 'No Refund Due',
  failed: 'Refund Failed',
};

export const DEPOSIT_STATUS_TONE: Record<DepositStatus, Tone> = {
  pending: 'neutral',
  held: 'primary',
  released: 'success',
  forfeited: 'danger',
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  pending: 'Pending',
  held: 'Held',
  released: 'Released',
  forfeited: 'Forfeited',
};

export const VEHICLE_STATUS_TONE: Record<VehicleStatus, Tone> = {
  available: 'success',
  reserved: 'warning',
  assigned: 'primary',
  maintenance: 'neutral',
  retired: 'danger',
};

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  assigned: 'Assigned',
  maintenance: 'In Maintenance',
  retired: 'Retired',
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

/** ₹ money formatter used across rider screens. */
export const formatMoney = (amount: number, currency = 'INR'): string => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
};
