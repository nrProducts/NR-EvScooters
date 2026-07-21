import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore, useCanRent } from '../store/useAuthStore';
import { rentGateDecision } from '../lib/rentGate';

/**
 * Shared by any "rent this scooter" CTA. Returns true (caller proceeds) when
 * the rider is eligible; otherwise shows a blocking explanation and a CTA
 * into the KYC flow, and returns false.
 */
export function useRentGate() {
  const canRent = useCanRent();
  const kycStatus = useAuthStore((s) => s.profile?.kyc_status ?? 'not_submitted');
  const router = useRouter();

  const attemptRent = (): boolean => {
    if (canRent) return true;

    const { title, message, ctaLabel } = rentGateDecision(kycStatus);
    Alert.alert(title, message, [
      { text: 'Not now', style: 'cancel' },
      { text: ctaLabel, onPress: () => router.push('/kyc') },
    ]);
    return false;
  };

  return { canRent, attemptRent };
}
