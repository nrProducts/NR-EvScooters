import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, Clock, ArrowRight } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import { confirmAction } from '../lib/confirm';
import { COLORS } from '../constants/theme';
import { useT } from '../i18n';

/**
 * Shown once per session after the profile step, before the KYC document
 * wizard. Marks itself seen on mount (not only on button press) so a rider
 * who backs out or force-quits mid-flow is never looped back here after
 * choosing to skip — see the routing gate in _layout.tsx.
 */
export default function KycIntroScreen() {
  const router = useRouter();
  const markKycIntroSeen = useAuthStore((s) => s.markKycIntroSeen);
  const { t } = useT();

  useEffect(() => {
    markKycIntroSeen();
  }, [markKycIntroSeen]);

  const skip = async () => {
    const confirmed = await confirmAction({
      title: t('kycIntro.skipConfirm.title'),
      message: t('kycIntro.skipConfirm.message'),
      confirmLabel: t('kycIntro.skip'),
      cancelLabel: t('auth.goBack'),
      destructive: true,
    });
    if (confirmed) router.replace('/home');
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ backgroundColor: COLORS.background }}
    >
      <View className="flex-1 px-6 pt-20 pb-10 items-center">
        <View
          className="w-20 h-20 rounded-3xl items-center justify-center mb-6"
          style={{ backgroundColor: COLORS.primary + '14' }}
        >
          <ShieldCheck size={36} color={COLORS.primary} />
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black text-center mb-3">
          {t('kycIntro.title')}
        </Text>
        <Text
          style={{ color: COLORS.textSecondary }}
          className="text-sm font-medium text-center leading-relaxed mb-8"
        >
          {t('kycIntro.body')}
        </Text>

        <View
          className="w-full flex-row items-center rounded-2xl p-4 mb-10 border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <Clock size={18} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-3">
            {t('kycIntro.duration')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/kyc?onboarding=1')}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.primary }}
          className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm mb-3"
        >
          <Text className="text-white font-bold text-base mr-2">{t('common.continue')}</Text>
          <ArrowRight size={18} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void skip()}
          accessibilityRole="button"
          className="w-full py-4 rounded-2xl flex-row justify-center items-center"
        >
          <Text style={{ color: COLORS.textSecondary }} className="font-bold text-sm">
            {t('kycIntro.skip')}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
