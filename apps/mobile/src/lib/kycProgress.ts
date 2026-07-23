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
  if (!isOnFile(kyc?.documents.find((d) => d.doc_type === 'aadhaar'))) return 2;
  if (!isOnFile(kyc?.documents.find((d) => d.doc_type === 'driving_license'))) return 3;
  return 4;
}
