import { describe, expect, it } from 'vitest';
import { computeInitialKycStep } from '../src/lib/kycProgress';
import type { ApiDocument } from '../src/types/api';

const doc = (overrides: Partial<ApiDocument>): ApiDocument => ({
  id: 'doc-1',
  doc_type: 'aadhaar',
  doc_number: '1234 5678 9012',
  verification_status: 'pending',
  rejection_reason: null,
  expiry_date: null,
  is_expired: false,
  submitted_at: '2026-07-01T00:00:00Z',
  verified_at: null,
  has_back_side: false,
  created_at: '2026-07-01T00:00:00Z',
  ...overrides,
});

const PROFILE_NONE = { profile_photo_url: null, emergency_contact_name: null, emergency_contact_phone: null };
const PROFILE_PHOTO_ONLY = { profile_photo_url: 'https://x/photo.jpg', emergency_contact_name: null, emergency_contact_phone: null };
const PROFILE_PHOTO_AND_CONTACT = {
  profile_photo_url: 'https://x/photo.jpg',
  emergency_contact_name: 'Jane Doe',
  emergency_contact_phone: '+919876543210',
};

describe('computeInitialKycStep', () => {
  it('returns step 0 when there is no photo yet', () => {
    expect(computeInitialKycStep(PROFILE_NONE, { documents: [] })).toBe(0);
  });

  it('returns step 0 for a null/undefined profile (pre-load state)', () => {
    expect(computeInitialKycStep(null, null)).toBe(0);
    expect(computeInitialKycStep(undefined, undefined)).toBe(0);
  });

  it('treats a null/undefined kyc summary as "no documents on file" rather than skipping ahead', () => {
    expect(computeInitialKycStep(PROFILE_PHOTO_AND_CONTACT, null)).toBe(2);
    expect(computeInitialKycStep(PROFILE_PHOTO_AND_CONTACT, undefined)).toBe(2);
  });

  it('returns step 1 when photo is on file but emergency contact is missing', () => {
    expect(computeInitialKycStep(PROFILE_PHOTO_ONLY, { documents: [] })).toBe(1);
  });

  it('returns step 1 when only one of emergency contact name/phone is set', () => {
    expect(
      computeInitialKycStep(
        { ...PROFILE_PHOTO_ONLY, emergency_contact_name: 'Jane Doe' },
        { documents: [] },
      ),
    ).toBe(1);
  });

  it('returns step 2 when photo + contact are done but Aadhaar is missing', () => {
    expect(computeInitialKycStep(PROFILE_PHOTO_AND_CONTACT, { documents: [] })).toBe(2);
  });

  it('returns step 2 when the Aadhaar on file was rejected, not just missing', () => {
    const documents = [doc({ doc_type: 'aadhaar', verification_status: 'rejected' })];
    expect(computeInitialKycStep(PROFILE_PHOTO_AND_CONTACT, { documents })).toBe(2);
  });

  it('returns step 3 when Aadhaar is on file but licence is missing', () => {
    const documents = [doc({ doc_type: 'aadhaar', verification_status: 'pending' })];
    expect(computeInitialKycStep(PROFILE_PHOTO_AND_CONTACT, { documents })).toBe(3);
  });

  it('returns step 4 when everything is on file', () => {
    const documents = [
      doc({ doc_type: 'aadhaar', verification_status: 'verified' }),
      doc({ doc_type: 'driving_license', verification_status: 'pending', id: 'doc-2' }),
    ];
    expect(computeInitialKycStep(PROFILE_PHOTO_AND_CONTACT, { documents })).toBe(4);
  });
});
