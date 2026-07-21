import type { AccountStatus, KycStatus, KycDocType, VerificationStatus } from '../types/api';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

export const ACCOUNT_STATUS_TONE: Record<AccountStatus, Tone> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
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

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};
