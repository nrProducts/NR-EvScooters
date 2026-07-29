import { useRouter } from 'expo-router';
import { useAuthStore, useCanRent } from '../store/useAuthStore';
import { rentGateDecision } from '../lib/rentGate';
import { confirmAction } from '../lib/confirm';

/**
 * Shared by any "rent this scooter" CTA. Resolves true (caller proceeds) when
 * the rider is eligible; otherwise shows a blocking explanation and a CTA
 * into the KYC flow, and resolves false.
 */
export function useRentGate() {
  const canRent = useCanRent();
  const kycStatus = useAuthStore((s) => s.profile?.kyc_status ?? 'not_submitted');
  const router = useRouter();

  const attemptRent = async (): Promise<boolean> => {
    if (canRent) return true;

    const { title, message, ctaLabel } = rentGateDecision(kycStatus);
    const goToKyc = await confirmAction({
      title,
      message,
      confirmLabel: ctaLabel,
      cancelLabel: 'Not now',
    });
    if (goToKyc) router.push('/kyc');
    return false;
  };

  return { canRent, attemptRent };
}
