import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gift, Copy, Share2, Check, Users, Clock, Ticket } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { Spinner } from '../../components/Spinner';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { useReferralSummary } from '../../hooks/useReferralSummary';
import { useT } from '../../i18n';
import type { CopyKey } from '../../i18n';
import { COLORS } from '../../constants/theme';
import { copyToClipboard } from '../../lib/clipboard';
import { notify, notifyError, notifySuccess } from '../../lib/confirm';
import { referralRepository } from '../../services';
import { ApiError } from '../../lib/ApiError';
import type { ApiReferralStatus, ApiRewardCardStatus } from '../../types/api';
import { formatDate } from '../../constants/status';

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const REFERRAL_STATUS_TONE: Record<ApiReferralStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  qualified: 'success',
  rejected: 'danger',
  revoked: 'danger',
};

const CARD_STATUS_TONE: Record<ApiRewardCardStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'primary'> = {
  available: 'primary',
  reserved: 'warning',
  redeemed: 'success',
  expired: 'neutral',
  revoked: 'danger',
};

/**
 * The rider's referral hub: their own code, what a successful referral is
 * currently worth, their reward cards, and who they've referred so far.
 *
 * Every number here is read from the backend, never computed locally — the
 * card model's whole point is that a rider cannot see (or spend) more than
 * what referral_reward_cards actually says exists for them.
 */
export default function ReferralsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { summary, loading, error, reload } = useReferralSummary();
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [applying, setApplying] = useState(false);

  const handleCopy = async () => {
    if (!summary?.referral_code) return;
    if (await copyToClipboard(summary.referral_code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      notifyError(t('referrals.copyFailed'));
    }
  };

  const handleShare = () => {
    if (!summary?.referral_code) return;
    void Share.share({
      message: t('referrals.shareMessage', { code: summary.referral_code }),
    });
  };

  const handleApply = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 6) {
      notifyError(t('referrals.applyInvalidLength'));
      return;
    }
    setApplying(true);
    try {
      const result = await referralRepository.redeem(code);
      setCodeInput('');
      if (result.outcome === 'already_applied') {
        notify(t('referrals.alreadyApplied.title'), t('referrals.alreadyApplied.body', { name: result.attribution.referrer_display_name }));
      } else {
        notifySuccess(t('referrals.applied.title'), t('referrals.applied.body', { name: result.attribution.referrer_display_name }));
      }
      void reload();
    } catch (err) {
      notifyError(t('referrals.applyFailed'), err instanceof ApiError ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  };

  return (
    <AppShell title={t('referrals.title')}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        {loading && !summary ? (
          <View className="items-center py-10"><Spinner size={24} color={COLORS.primary} /></View>
        ) : !summary ? (
          <ErrorState message={error ?? t('referrals.loadFailed')} onRetry={reload} />
        ) : (
          <>
            {/* --- my code ------------------------------------------------ */}
            <View
              className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: COLORS.primary }}
            >
              <View className="flex-row items-center mb-2">
                <Gift size={18} color="#FFF" />
                <Text className="text-white text-sm font-extrabold ml-2">{t('referrals.inviteHeading')}</Text>
              </View>
              <Text className="text-white/90 text-xs font-medium mb-3 leading-relaxed">
                {summary.program_enabled
                  ? t('referrals.inviteBody', { amount: summary.reward_amount })
                  : t('referrals.programDisabled')}
              </Text>

              <View
                className="flex-row items-center justify-between rounded-xl px-4 py-3 mb-2"
                style={{ backgroundColor: '#FFFFFF22' }}
              >
                <Text className="text-white text-lg font-black tracking-[4px]">{summary.referral_code}</Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <TouchableOpacity
                    onPress={handleCopy}
                    accessibilityRole="button"
                    accessibilityLabel={t('referrals.copyCode')}
                    className="w-8 h-8 rounded-lg items-center justify-center"
                    style={{ backgroundColor: '#FFFFFF33' }}
                  >
                    {copied ? <Check size={15} color="#FFF" /> : <Copy size={15} color="#FFF" />}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleShare}
                    accessibilityRole="button"
                    accessibilityLabel={t('referrals.shareCode')}
                    className="w-8 h-8 rounded-lg items-center justify-center"
                    style={{ backgroundColor: '#FFFFFF33' }}
                  >
                    <Share2 size={15} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* --- counts --------------------------------------------------- */}
            <View className="flex-row mb-4" style={{ gap: 10 }}>
              <StatTile icon={Users} label={t('referrals.stat.referred')} value={summary.referred_count} />
              <StatTile icon={Clock} label={t('referrals.stat.pending')} value={summary.pending_count} />
              <StatTile icon={Ticket} label={t('referrals.stat.cards')} value={summary.available_card_count} />
            </View>

            {/* --- apply someone else's code --------------------------------- */}
            {!summary.my_attribution ? (
              <View
                className="rounded-2xl border p-4 mb-4"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
              >
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mb-1">
                  {t('referrals.haveACode')}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-3 leading-relaxed">
                  {t('referrals.haveACodeHelp')}
                </Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <View
                    className="flex-1 rounded-xl border px-3"
                    style={{ borderColor: COLORS.border, backgroundColor: COLORS.background, height: 44, justifyContent: 'center' }}
                  >
                    <CodeInput value={codeInput} onChange={setCodeInput} />
                  </View>
                  <TouchableOpacity
                    onPress={handleApply}
                    disabled={applying || codeInput.trim().length !== 6}
                    accessibilityRole="button"
                    className="rounded-xl px-4 items-center justify-center"
                    style={{
                      backgroundColor: COLORS.primary, height: 44,
                      opacity: applying || codeInput.trim().length !== 6 ? 0.5 : 1,
                    }}
                  >
                    {applying
                      ? <Spinner size={16} color="#FFF" />
                      : <Text className="text-white text-xs font-extrabold">{t('referrals.apply')}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View
                className="rounded-2xl border p-4 mb-4 flex-row items-center"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.card, gap: 12 }}
              >
                <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: COLORS.primary + '14' }}>
                  <Check size={17} color={COLORS.primary} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-bold">
                    {t('referrals.referredBy', { name: summary.my_attribution.referrer_display_name })}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                    {formatDate(summary.my_attribution.created_at)}
                  </Text>
                </View>
                <Badge
                  label={t(`referrals.status.${summary.my_attribution.status}` as CopyKey)}
                  tone={REFERRAL_STATUS_TONE[summary.my_attribution.status]}
                />
              </View>
            )}

            {/* --- my reward cards -------------------------------------------- */}
            <Heading>{t('referrals.myCards')}</Heading>
            {summary.cards.length === 0 ? (
              <EmptyNote text={t('referrals.noCardsYet')} />
            ) : (
              <View style={{ gap: 10 }} className="mb-2">
                {summary.cards.map((card) => (
                  <View
                    key={card.id}
                    className="rounded-2xl border p-4 flex-row items-center justify-between"
                    style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                  >
                    <View>
                      <Text style={{ color: COLORS.textPrimary }} className="text-base font-black">
                        {money(card.amount)} {t('referrals.off')}
                      </Text>
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                        {card.expires_at
                          ? t('referrals.validUntil', { date: formatDate(card.expires_at) })
                          : t('referrals.noExpiry')}
                      </Text>
                    </View>
                    <Badge label={t(`referrals.cardStatus.${card.status}` as CopyKey)} tone={CARD_STATUS_TONE[card.status]} />
                  </View>
                ))}
              </View>
            )}

            {/* --- history ------------------------------------------------ */}
            <Heading>{t('referrals.history')}</Heading>
            {summary.history.length === 0 ? (
              <EmptyNote text={t('referrals.noReferralsYet')} />
            ) : (
              <View style={{ gap: 10 }}>
                {summary.history.map((item) => (
                  <View
                    key={item.id}
                    className="rounded-2xl border p-3.5 flex-row items-center justify-between"
                    style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                  >
                    <View className="flex-1 mr-3">
                      <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-bold">
                        {item.referee_display_name}
                      </Text>
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                        {formatDate(item.created_at)}
                      </Text>
                    </View>
                    <Badge label={t(`referrals.status.${item.status}` as CopyKey)} tone={REFERRAL_STATUS_TONE[item.status]} />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </AppShell>
  );
}

const Heading: React.FC<{ children: string }> = ({ children }) => (
  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider mt-5 mb-2.5">
    {children}
  </Text>
);

const EmptyNote: React.FC<{ text: string }> = ({ text }) => (
  <View className="rounded-2xl border p-4" style={{ borderColor: COLORS.border, backgroundColor: COLORS.background }}>
    <Text style={{ color: COLORS.textSecondary }} className="text-[12px] font-medium text-center">{text}</Text>
  </View>
);

const StatTile: React.FC<{ icon: typeof Users; label: string; value: number }> = ({ icon: Icon, label, value }) => (
  <View
    className="flex-1 rounded-2xl border p-3 items-center"
    style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
  >
    <Icon size={16} color={COLORS.primary} />
    <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black mt-1">{value}</Text>
    <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-semibold text-center mt-0.5">{label}</Text>
  </View>
);

const CodeInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { t } = useT();
  return (
    <TextInput
      value={value}
      onChangeText={(v: string) => onChange(v.toUpperCase().slice(0, 6))}
      placeholder={t('referrals.codePlaceholder')}
      placeholderTextColor={COLORS.textSecondary}
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={6}
      style={{ color: COLORS.textPrimary, fontSize: 14, fontWeight: '800', letterSpacing: 2 }}
    />
  );
};
