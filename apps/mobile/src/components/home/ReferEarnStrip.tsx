import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Gift, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { useReferralSummary } from '../../hooks/useReferralSummary';
import { useT } from '../../i18n';

/**
 * One-line "Refer & Earn" strip on Home. The reward amount comes from the live
 * programme config (summary.reward_amount), never hard-coded. Renders nothing
 * until that has loaded, and nothing at all when the programme is off or the
 * account has no code — a promo for a reward that can't be earned is worse
 * than no promo. Detail lives on /referrals.
 */
export const ReferEarnStrip: React.FC = () => {
  const router = useRouter();
  const { t } = useT();
  const { summary } = useReferralSummary();

  if (!summary?.program_enabled || !summary.referral_code || summary.reward_amount <= 0) {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={() => router.push('/referrals' as any)}
      accessibilityRole="button"
      activeOpacity={0.85}
      className="rounded-xl border px-3 py-2.5 mb-5 flex-row items-center"
      style={{ backgroundColor: COLORS.primary + '0F', borderColor: COLORS.primary + '26' }}
    >
      <Gift size={15} color={COLORS.primary} />
      <Text style={{ color: COLORS.textPrimary }} className="flex-1 text-xs font-semibold ml-2" numberOfLines={1}>
        <Text style={{ color: COLORS.primaryPressed }} className="font-extrabold">{t('referrals.title')}</Text>
        {'  ·  '}
        {/* Not booked yet: referring isn't open to them, so the strip says how
            to unlock it rather than promising a reward they can't earn yet. */}
        {summary.can_refer === false
          ? t('home.referEarn.locked')
          : t('home.referEarn.body', { amount: summary.reward_amount })}
      </Text>
      <ChevronRight size={14} color={COLORS.primaryPressed} />
    </TouchableOpacity>
  );
};
