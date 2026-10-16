import type { ApiDocument } from '../types/api';

export type KycStep = 0 | 1 | 2 | 3 | 4;

interface ProfileProgressFields {
  profile_photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

interface KycProgressFields {
  documents: ApiDocument[];
}

/** A rejected document must be redone, so it doesn't count as "on file". */
const isOnFile = (doc?: ApiDocument): boolean => !!doc && doc.verification_status !== 'rejected';

/**
 * Derives which KYC wizard step a rider should resume at, from data that's
 * already fetched on every mount (profile fields + documents) — there is no
 * separate "current step" persisted anywhere, client or server, so this is
 * recomputed each time rather than read back from storage. Keeps kyc.tsx's
 * "Skip for Now" promise ("your progress is saved") actually true.
 */
export function computeInitialKycStep(
  profile: ProfileProgressFields | null | undefined,
  kyc: KycProgressFields | null | undefined,
): KycStep {
  if (!profile?.profile_photo_url) return 0;
  if (!profile.emergency_contact_name || !profile.emergency_contact_phone) return 1;
  if (!isOnFile(kyc?.documents.find((d) => d.document_type === 'aadhaar'))) return 2;
  if (!isOnFile(kyc?.documents.find((d) => d.document_type === 'driving_licence'))) return 3;
  return 4;
}

/**
 * The header bar's percentage, from what the rider has actually DONE.
 *
 * The server's `completion_percent` counts only admin-VERIFIED documents, so
 * the bar sat at 0% through every step the rider completes and through the
 * whole review wait, jumping to 100% only once staff approved. This follows
 * the wizard instead: photo, emergency contact, Aadhaar and licence are 20%
 * each, handing the application in for review reaches 90%, and 100% is
 * reserved for fully verified.
 */
export function computeKycProgressPercent(
  profile: ProfileProgressFields | null | undefined,
  kyc: (KycProgressFields & { kyc_status?: string }) | null | undefined,
): number {
  if (kyc?.kyc_status === 'verified') return 100;

  const done = [
    !!profile?.profile_photo_url,
    !!profile?.emergency_contact_name && !!profile?.emergency_contact_phone,
    isOnFile(kyc?.documents.find((d) => d.document_type === 'aadhaar')),
    isOnFile(kyc?.documents.find((d) => d.document_type === 'driving_licence')),
  ].filter(Boolean).length;

  const submitted = kyc?.kyc_status === 'pending' || kyc?.kyc_status === 'partially_verified';
  if (done === 4 && submitted) return 90;
  return done * 20;
}
