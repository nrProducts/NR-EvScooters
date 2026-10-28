import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Gift, Check } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { useReferralSummary } from '../hooks/useReferralSummary';
import { referralRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { useT } from '../i18n';
import { COLORS } from '../constants/theme';
import { GradientFill } from './ui/GradientFill';

/**
 * The rider's own code (ALWAYS shown, so sharing it is never a hunt — Profile,
 * the KYC review step, and profile setup all render the same line) plus, when
 * this account has not yet applied anyone else's code, an inline Apply box.
 *
 * One component, three mount points, so "did I already enter a code" and
 * "what's my own code" can never drift between where a rider happens to see
 * them. Self-contained: fetches its own summary, same standalone pattern as
 * the old KycBanner.
 */
export const ReferralCodeEntry: React.FC = () => {
  const { t } = useT();
  const { summary, reload } = useReferralSummary();
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  if (!summary) return null;

  const apply = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError(t('referrals.applyInvalidLength'));
      return;
    }
    setError('');
    setApplying(true);
    try {
      await referralRepository.redeem(trimmed);
      setCode('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('referrals.applyFailed'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <View className="rounded-2xl border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}>
      {/* Own code — always visible here, so this card doubles as "remember
          to share yours" every time a rider passes through it. */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Gift size={15} color={COLORS.primary} />
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
            {t('referrals.yourCode')}
          </Text>
        </View>
        <Text style={{ color: COLORS.primary }} className="text-sm font-black tracking-[3px]">
          {summary.referral_code}
        </Text>
      </View>

      {summary.my_attribution ? (
        <View className="flex-row items-center pt-3" style={{ borderTopWidth: 1, borderColor: COLORS.border, gap: 10 }}>
          <View className="w-7 h-7 rounded-lg items-center justify-center" style={{ backgroundColor: COLORS.primary + '14' }}>
            <Check size={14} color={COLORS.primary} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-[12px] font-semibold flex-1">
            {t('referrals.referredBy', { name: summary.my_attribution.referrer_display_name })}
          </Text>
        </View>
      ) : (
        <View className="pt-3" style={{ borderTopWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-2">
            {t('referrals.haveACode')}
          </Text>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <View
              className="flex-1 rounded-xl border px-3"
              style={{ borderColor: error ? COLORS.danger : COLORS.border, backgroundColor: COLORS.background, height: 42, justifyContent: 'center' }}
            >
              <TextInput
                value={code}
                onChangeText={(v) => { setCode(v.toUpperCase().slice(0, 6)); if (error) setError(''); }}
                placeholder={t('referrals.codePlaceholder')}
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                style={{ color: COLORS.textPrimary, fontSize: 13, fontWeight: '800', letterSpacing: 2 }}
              />
            </View>
            <TouchableOpacity
              onPress={() => void apply()}
              disabled={applying || code.trim().length !== 6}
              accessibilityRole="button"
              className="rounded-xl px-4 items-center justify-center"
              style={{ backgroundColor: COLORS.primary, overflow: 'hidden', height: 42, opacity: applying || code.trim().length !== 6 ? 0.5 : 1 }}
            >
              <GradientFill />
              {applying ? <Spinner size={14} color="#FFF" /> : <Text className="text-white text-xs font-extrabold">{t('referrals.apply')}</Text>}
            </TouchableOpacity>
          </View>
          {error ? (
            <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mt-2">{error}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
};
