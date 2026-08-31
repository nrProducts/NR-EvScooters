/**
 * Ported verbatim from apps/mobile/src/lib/rentGate.ts — keep in sync.
 *
 * Pure decision table for the "can this rider rent?" gate.
 */
import type { KycStatus } from '../types/api';

export interface RentGateDecision {
  title: string;
  message: string;
  ctaLabel: string;
}

export function rentGateDecision(kycStatus: KycStatus): RentGateDecision {
  switch (kycStatus) {
    case 'rejected':
      return {
        title: 'Complete KYC to rent',
        message: 'Your last KYC submission was rejected. Please review and resubmit before renting.',
        ctaLabel: 'View KYC status',
      };
    case 'pending':
    case 'partially_verified':
      return {
        title: 'KYC under review',
        message: 'Your documents are still being reviewed. You will be able to rent once they are approved.',
        ctaLabel: 'View KYC status',
      };
    case 'verified':
      return { title: '', message: '', ctaLabel: '' };
    case 'not_submitted':
    default:
      return {
        title: 'Complete KYC to rent',
        message: 'You need a verified identity before renting a scooter.',
        ctaLabel: 'Start KYC',
      };
  }
}
