import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, X } from 'lucide-react-native';
import { useAuthStore, useCanRent } from '../store/useAuthStore';
import { useDismissibleBanner } from '../lib/dismissedBanners';
import { COLORS } from '../constants/theme';
import { useT } from '../i18n';

/**
 * A single compact line on Home, shown until KYC is verified — deliberately not
 * a warning box. Reads the real profile from useAuthStore.
 */
export const KycBanner: React.FC = () => {
  const router = useRouter();
  const canRent = useCanRent();
  const { t } = useT();
  const kycStatus = useAuthStore((s) => s.profile?.kyc_status ?? 'not_submitted');
  const profileId = useAuthStore((s) => s.profile?.id);
  const inReview = kycStatus === 'pending' || kycStatus === 'partially_verified';

  // "Under review" asks nothing of the rider, so it can be closed; "rejected"
  // and "incomplete" block booking until they act, so those cannot. Keyed by
  // account and status, so a shared phone or a later status shows again.
  const [reviewDismissed, dismissReview] = useDismissibleBanner(
    !canRent && inReview && profileId ? `kyc:${profileId}:${kycStatus}` : null,
  );

  if (canRent) return null;
  if (inReview && reviewDismissed) return null;

  const message =
    kycStatus === 'rejected'
      ? t('kycBanner.rejected')
      : inReview
        ? t('kycBanner.inReview')
        : t('kycBanner.incomplete');

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
      {inReview ? (
        // Nested touchable: RN gives the tap to the innermost responder, so
        // closing does not also open /kyc.
        <TouchableOpacity
          onPress={dismissReview}
          accessibilityRole="button"
          accessibilityLabel={t('ui.dismiss')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="-mr-1 -my-1 p-1 ml-2"
        >
          <X size={14} color={COLORS.primaryPressed} />
        </TouchableOpacity>
      ) : (
        <ArrowRight size={15} color={COLORS.primaryPressed} />
      )}
    </TouchableOpacity>
  );
};
