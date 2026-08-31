/**
 * Ported verbatim from apps/mobile/src/lib/onboarding.ts — keep in sync.
 * Pure onboarding/KYC state helpers.
 */
import { MANDATORY_KYC_DOC_TYPES } from '../types/api';
import type { KycDocType, KycStatus } from '../types/api';

export type OnboardingUiState =
  | 'new_user'
  | 'profile_completed'
  | 'kyc_not_started'
  | 'kyc_in_progress'
  | 'kyc_submitted'
  | 'kyc_under_review'
  | 'kyc_approved'
  | 'kyc_rejected';

export interface OnboardingProfile {
  full_name: string;
  kyc_status: KycStatus;
}

export interface OnboardingDocument {
  doc_type: KycDocType;
  submitted_at: string | null;
}

export function deriveOnboardingUiState(
  profile: OnboardingProfile | null,
  documents: OnboardingDocument[],
): OnboardingUiState {
  if (!profile || !profile.full_name || profile.full_name.trim().length === 0) {
    return 'new_user';
  }

  if (profile.kyc_status === 'verified') return 'kyc_approved';
  if (profile.kyc_status === 'rejected') return 'kyc_rejected';

  if (profile.kyc_status === 'pending' || profile.kyc_status === 'partially_verified') {
    const allMandatorySubmitted = MANDATORY_KYC_DOC_TYPES.every((type) =>
      documents.some((d) => d.doc_type === type && !!d.submitted_at),
    );
    return allMandatorySubmitted ? 'kyc_under_review' : 'kyc_submitted';
  }

  return documents.length > 0 ? 'kyc_in_progress' : 'kyc_not_started';
}

export const ONBOARDING_STATE_LABEL: Record<OnboardingUiState, string> = {
  new_user: 'New User',
  profile_completed: 'Profile Completed',
  kyc_not_started: 'KYC Not Started',
  kyc_in_progress: 'KYC In Progress',
  kyc_submitted: 'KYC Submitted',
  kyc_under_review: 'KYC Under Review',
  kyc_approved: 'KYC Approved',
  kyc_rejected: 'KYC Rejected',
};
