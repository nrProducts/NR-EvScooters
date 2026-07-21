import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck, Clock, ArrowRight } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import { confirmAction } from '../lib/confirm';
import { COLORS } from '../constants/theme';

/**
 * Shown once per session after the profile step, before the KYC document
 * wizard. Marks itself seen on mount (not only on button press) so a rider
 * who backs out or force-quits mid-flow is never looped back here after
 * choosing to skip — see the routing gate in _layout.tsx.
 */
export default function KycIntroScreen() {
  const router = useRouter();
  const markKycIntroSeen = useAuthStore((s) => s.markKycIntroSeen);

  useEffect(() => {
    markKycIntroSeen();
  }, [markKycIntroSeen]);

  const skip = async () => {
    const confirmed = await confirmAction({
      title: 'Skip KYC for now?',
      message: 'You can still browse the app, but you will need to complete KYC before renting a scooter.',
      confirmLabel: 'Skip for Now',
      cancelLabel: 'Go back',
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
          Verify your identity to unlock vehicle rentals
        </Text>
        <Text
          style={{ color: COLORS.textSecondary }}
          className="text-sm font-medium text-center leading-relaxed mb-8"
        >
          A quick identity check keeps every ride safer for you and other riders. You will need a
          photo of yourself, an emergency contact, your Aadhaar number and your driving licence.
        </Text>

        <View
          className="w-full flex-row items-center rounded-2xl p-4 mb-10 border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <Clock size={18} color={COLORS.textSecondary} />
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-3">
            Takes about 5 minutes. You can save your progress and finish it anytime.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/kyc?onboarding=1')}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.primary }}
          className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm mb-3"
        >
          <Text className="text-white font-bold text-base mr-2">Continue</Text>
          <ArrowRight size={18} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => void skip()}
          accessibilityRole="button"
          className="w-full py-4 rounded-2xl flex-row justify-center items-center"
        >
          <Text style={{ color: COLORS.textSecondary }} className="font-bold text-sm">
            Skip for Now
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
