import type { ApiDocument, KycStatus } from '../types/api';
import { MANDATORY_KYC_DOC_TYPES } from '../types/api';

/**
 * Mirrors public.compute_kyc_status() in the backend migration, so the mock
 * data source behaves like the real one instead of inventing its own rules.
 * The database remains authoritative in live mode; this is used to derive a
 * status locally for mock mode and for optimistic display.
 */
type DocLike = Pick<ApiDocument, 'doc_type' | 'verification_status' | 'expiry_date'>;

const today = () => new Date().toISOString().slice(0, 10);

export const isExpired = (date: string | null): boolean => !!date && date < today();

export function deriveKycStatus(docs: DocLike[]): KycStatus {
    const mandatory = docs.filter((d) => MANDATORY_KYC_DOC_TYPES.includes(d.doc_type));
    if (mandatory.length === 0) return 'not_submitted';

    // One rejected mandatory document rejects the whole submission.
    if (mandatory.some((d) => d.verification_status === 'rejected')) return 'rejected';

    const verified = mandatory.filter(
        (d) => d.verification_status === 'verified' && !isExpired(d.expiry_date),
    ).length;

    if (verified === MANDATORY_KYC_DOC_TYPES.length) return 'verified';
    if (verified > 0) return 'partially_verified';
    return 'pending';
}

export function kycCompletionPercent(docs: DocLike[]): number {
    const verified = MANDATORY_KYC_DOC_TYPES.filter((type) =>
        docs.some(
            (d) =>
                d.doc_type === type &&
                d.verification_status === 'verified' &&
                !isExpired(d.expiry_date),
        ),
    ).length;
    return Math.round((verified / MANDATORY_KYC_DOC_TYPES.length) * 100);
}
