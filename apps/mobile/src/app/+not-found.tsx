import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Compass } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useT } from '../i18n';

/**
 * Shown for any URL that matches no route, in place of expo-router's default
 * "Unmatched Route" developer page — which in a release build is a blank
 * white screen with a sitemap link that means nothing to a rider.
 *
 * The known way to land here was a notification pointing at a screen that did
 * not exist; those are now resolved before navigating (lib/notificationRoute.ts).
 * This stays as the safety net for anything else: a stale deep link, a
 * restored navigation state after an update removed a screen.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useT();

  const goHome = () => {
    // replace, not push: there is nothing on this screen to come back to.
    router.replace('/home');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mb-5"
          style={{ backgroundColor: COLORS.primary + '14' }}
        >
          <Compass size={30} color={COLORS.primary} />
        </View>
        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">
          {t('notFound.title')}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium text-center mt-2 leading-relaxed">
          {t('notFound.message')}
        </Text>
        <TouchableOpacity
          onPress={goHome}
          accessibilityRole="button"
          className="mt-8 py-3.5 px-8 rounded-2xl items-center"
          style={{ backgroundColor: COLORS.primary }}
        >
          <Text className="text-white text-sm font-bold">{t('notFound.goHome')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
