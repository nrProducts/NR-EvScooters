import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldAlert, ChevronRight } from 'lucide-react-native';
import { useAuthStore, useCanRent } from '../store/useAuthStore';
import { COLORS } from '../constants/theme';

/**
 * Persistent warning shown on Home until KYC is verified. Reads the real
 * profile from useAuthStore, not the mock fleet store — additive to the
 * existing (still mock-backed) Home content.
 */
export const KycBanner: React.FC = () => {
  const router = useRouter();
  const canRent = useCanRent();
  const kycStatus = useAuthStore((s) => s.profile?.kyc_status ?? 'not_submitted');

  if (canRent) return null;

  const message =
    kycStatus === 'rejected'
      ? 'A document was rejected. Fix it to unlock scooter rentals.'
      : kycStatus === 'pending' || kycStatus === 'partially_verified'
        ? 'Your KYC is being reviewed. Rentals unlock once it is approved.'
        : 'Complete your KYC to unlock scooter rentals.';

  return (
    <TouchableOpacity
      onPress={() => router.push('/kyc')}
      accessibilityRole="button"
      className="rounded-2xl p-4 mb-4 flex-row items-center"
      style={{ backgroundColor: COLORS.warning + '14', borderWidth: 1, borderColor: COLORS.warning + '33' }}
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: COLORS.warning + '22' }}
      >
        <ShieldAlert size={18} color={COLORS.warning} />
      </View>
      <View className="flex-1">
        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold mb-0.5">
          {kycStatus === 'not_submitted' ? 'Complete Your KYC' : 'KYC In Progress'}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
          {message}
        </Text>
      </View>
      <ChevronRight size={18} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
};
