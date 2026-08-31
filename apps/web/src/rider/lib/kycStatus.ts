/**
 * Ported verbatim from apps/mobile/src/lib/kycStatus.ts — keep in sync.
 *
 * Mirrors public.compute_kyc_status() in the backend. The database remains
 * authoritative in live mode; this is used for optimistic display.
 */
import type { ApiDocument, KycStatus } from '../types/api';
import { MANDATORY_KYC_DOC_TYPES } from '../types/api';

type DocLike = Pick<ApiDocument, 'document_type' | 'verification_status' | 'expires_on'>;

const today = () => new Date().toISOString().slice(0, 10);

export const isExpired = (date: string | null): boolean => !!date && date < today();

export function deriveKycStatus(docs: DocLike[]): KycStatus {
    const mandatory = docs.filter((d) => MANDATORY_KYC_DOC_TYPES.includes(d.document_type));
    if (mandatory.length === 0) return 'not_submitted';

    if (mandatory.some((d) => d.verification_status === 'rejected')) return 'rejected';

    const verified = mandatory.filter(
        (d) => d.verification_status === 'verified' && !isExpired(d.expires_on),
    ).length;

    if (verified === MANDATORY_KYC_DOC_TYPES.length) return 'verified';
    if (verified > 0) return 'partially_verified';
    return 'pending';
}

export function kycCompletionPercent(docs: DocLike[]): number {
    const verified = MANDATORY_KYC_DOC_TYPES.filter((type) =>
        docs.some(
            (d) =>
                d.document_type === type &&
                d.verification_status === 'verified' &&
                !isExpired(d.expires_on),
        ),
    ).length;
    return Math.round((verified / MANDATORY_KYC_DOC_TYPES.length) * 100);
}
