import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { Gift, Share2 } from 'lucide-react-native';
import { referralRepository } from '../services';
import { COLORS } from '../constants/theme';
import type { ApiReferralSummary } from '../types/api';

/**
 * Promotional Refer & Earn card, self-contained fetch on mount — same
 * standalone pattern as KycBanner, additive to the rest of Home.
 */
export const ReferAndEarnBanner: React.FC = () => {
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
      message: `Join me on the app and get ₹${summary.offer_amount} off your first booking! Use my referral code ${summary.referral_code} when you sign up.`,
    });
  };

  return (
    <View
      className="rounded-2xl p-4 mb-4"
      style={{ backgroundColor: COLORS.primary, }}
    >
      <View className="flex-row items-center mb-2">
        <Gift size={18} color="#FFF" />
        <Text className="text-white text-sm font-extrabold ml-2">Refer & Earn</Text>
      </View>
      <Text className="text-white/90 text-xs font-medium mb-3 leading-relaxed">
        Share your code — your friend gets ₹{summary.offer_amount} off their first booking, and you earn a reward
        once they complete it.
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
          <Text className="text-white text-xs font-bold ml-1.5">Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
