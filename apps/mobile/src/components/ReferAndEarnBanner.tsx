import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { Gift, Share2 } from 'lucide-react-native';
import { referralRepository } from '../services';
import { COLORS } from '../constants/theme';
import { useT } from '../i18n';
import type { ApiReferralSummary } from '../types/api';

/**
 * Promotional Refer & Earn card, self-contained fetch on mount — same
 * standalone pattern as KycBanner, additive to the rest of Home.
 *
 * ── NOT MOUNTED. Do not re-add without a schema first. ───────────────────
 *
 * Referrals are not part of the current database. `referrals`,
 * `referral_rewards` and `users.referral_code` have no successor, and
 * apps/backend/src/modules/referrals/referrals.service.ts is a documented
 * stub that rejects every call — so `referralRepository.mine()` always
 * throws, the catch below swallows it, and this renders null every time.
 *
 * Kept rather than deleted for the same reason the backend stub is kept: it
 * is the specification of what the feature did, and referrals are out of
 * scope for this migration rather than cancelled. Removed from home.tsx
 * because a component that cannot render should not also be issuing a doomed
 * request on every mount. See docs/final-system-audit (finding M5).
 */
export const ReferAndEarnBanner: React.FC = () => {
  const { t } = useT();
  const [summary, setSummary] = useState<ApiReferralSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void referralRepository.mine().then((s) => {
      if (!cancelled) setSummary(s);
    }).catch(() => {
      // Non-critical promo content — fail silently rather than showing an error card.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary?.referral_code) return null;

  const share = () => {
    void Share.share({
      message: t('referral.shareMessage', { amount: summary.offer_amount, code: summary.referral_code ?? '' }),
    });
  };

  return (
    <View
      className="rounded-2xl p-4 mb-4"
      style={{ backgroundColor: COLORS.primary, }}
    >
      <View className="flex-row items-center mb-2">
        <Gift size={18} color="#FFF" />
        <Text className="text-white text-sm font-extrabold ml-2">{t('referral.title')}</Text>
      </View>
      <Text className="text-white/90 text-xs font-medium mb-3 leading-relaxed">
        {t('referral.body', { amount: summary.offer_amount })}
      </Text>

      <View className="flex-row items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: '#FFFFFF22' }}>
        <Text className="text-white text-base font-black tracking-widest">{summary.referral_code}</Text>
        <TouchableOpacity
          onPress={share}
          accessibilityRole="button"
          className="flex-row items-center rounded-lg px-3 py-1.5"
          style={{ backgroundColor: '#FFFFFF33' }}
        >
          <Share2 size={13} color="#FFF" />
          <Text className="text-white text-xs font-bold ml-1.5">{t('referral.share')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
