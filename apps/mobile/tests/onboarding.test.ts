import { describe, expect, it } from 'vitest';
import { deriveOnboardingUiState } from '../src/lib/onboarding';
import type { OnboardingDocument, OnboardingProfile } from '../src/lib/onboarding';

const profile = (kyc_status: OnboardingProfile['kyc_status'], full_name = 'Asha Menon'): OnboardingProfile => ({
  full_name, kyc_status,
});

const doc = (submitted: boolean): OnboardingDocument => ({
  doc_type: 'aadhaar', submitted_at: submitted ? '2026-01-01T00:00:00Z' : null,
});

describe('deriveOnboardingUiState', () => {
  it('is new_user when there is no profile yet', () => {
    expect(deriveOnboardingUiState(null, [])).toBe('new_user');
  });

  it('is new_user when the profile has no name', () => {
    expect(deriveOnboardingUiState(profile('not_submitted', ''), [])).toBe('new_user');
  });

  it('is kyc_not_started with a name but no documents', () => {
    expect(deriveOnboardingUiState(profile('not_submitted'), [])).toBe('kyc_not_started');
  });

  it('is kyc_in_progress once a document exists but kyc_status is still not_submitted', () => {
    expect(deriveOnboardingUiState(profile('not_submitted'), [doc(false)])).toBe('kyc_in_progress');
  });

  it('is kyc_submitted once documents are submitted but not all mandatory ones yet', () => {
    const docs = [doc(true), { doc_type: 'driving_license' as const, submitted_at: null }];
    expect(deriveOnboardingUiState(profile('pending'), docs)).toBe('kyc_submitted');
  });

  it('is kyc_under_review once every mandatory document has been submitted', () => {
    const docs = [doc(true), { doc_type: 'driving_license' as const, submitted_at: '2026-01-01T00:00:00Z' }];
    expect(deriveOnboardingUiState(profile('pending'), docs)).toBe('kyc_under_review');
    expect(deriveOnboardingUiState(profile('partially_verified'), docs)).toBe('kyc_under_review');
  });

  it('is kyc_approved when verified', () => {
    expect(deriveOnboardingUiState(profile('verified'), [])).toBe('kyc_approved');
  });

  it('is kyc_rejected when rejected', () => {
    expect(deriveOnboardingUiState(profile('rejected'), [])).toBe('kyc_rejected');
  });
});
