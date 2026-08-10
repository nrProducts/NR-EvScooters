import type {
  BillingCycle, BookingRefundStatus, BookingStatus, KycStatus, KycDocType, MaintenanceStatus,
  RentalStatus, SupportStatus, VerificationStatus, VehicleStatus,
} from '../types/api';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

/** The unit a plan's price is quoted in — "₹2499 / Month". */
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

/** Enum values are snake_case; these are what a human should read. */
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
  driving_license: 'Driving Licence',
  passport: 'Passport',
  voter_id: 'Voter ID',
  address_proof: 'Address Proof',
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, Tone> = {
  pending_payment: 'warning',
  confirmed: 'primary',
  fulfilled: 'success',
  cancelled: 'danger',
  expired: 'neutral',
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  fulfilled: 'Picked Up',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const RENTAL_STATUS_TONE: Record<RentalStatus, Tone> = {
  active: 'primary',
  completed: 'success',
  force_ended: 'warning',
  cancelled: 'danger',
};

export const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  force_ended: 'Force Ended',
  cancelled: 'Cancelled',
};

export const MAINTENANCE_STATUS_TONE: Record<MaintenanceStatus, Tone> = {
  reported: 'warning',
  in_progress: 'primary',
  resolved: 'success',
  cancelled: 'neutral',
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  reported: 'Reported',
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
  processed: 'success',
  not_required: 'neutral',
};

export const REFUND_STATUS_LABEL: Record<BookingRefundStatus, string> = {
  pending: 'Refund Pending',
  processed: 'Refund Processed',
  not_required: 'No Refund Due',
};

export const VEHICLE_STATUS_TONE: Record<VehicleStatus, Tone> = {
  available: 'success',
  booked: 'warning',
  assigned: 'primary',
  maintenance: 'neutral',
  scrap: 'danger',
};

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: 'Available',
  booked: 'Booked',
  assigned: 'Assigned',
  maintenance: 'In Maintenance',
  scrap: 'Retired',
};

export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
