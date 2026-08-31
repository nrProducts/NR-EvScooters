import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useAuthStore, useCanRent } from '../store/useAuthStore';
import { COLORS } from '../constants/theme';

/**
 * A single compact line on Home, shown until KYC is verified — deliberately not
 * a warning box. Reads the real profile from useAuthStore.
 */
export const KycBanner: React.FC = () => {
  const router = useRouter();
  const canRent = useCanRent();
  const kycStatus = useAuthStore((s) => s.profile?.kyc_status ?? 'not_submitted');

  if (canRent) return null;

  const inReview = kycStatus === 'pending' || kycStatus === 'partially_verified';
  const message =
    kycStatus === 'rejected'
      ? 'A document needs fixing to unlock all features'
      : inReview
        ? "Your profile is under review — we'll notify you"
        : 'Complete your profile to unlock all features';

  return (
    <TouchableOpacity
      onPress={() => router.push('/kyc')}
      accessibilityRole="button"
      className="rounded-2xl px-4 py-3 mb-4 flex-row items-center"
      style={{ backgroundColor: COLORS.primary + '10' }}
    >
      <Text style={{ color: COLORS.primaryPressed }} className="text-xs font-bold flex-1">
        {message}
      </Text>
      <ArrowRight size={15} color={COLORS.primaryPressed} />
    </TouchableOpacity>
  );
};
