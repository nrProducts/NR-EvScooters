import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LifeBuoy, ChevronRight } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { useT } from '../../i18n';

/** Compact "we're here to help" card at the tail of Home. */
export const NeedHelpCard: React.FC = () => {
  const router = useRouter();
  const { t } = useT();

  return (
    <View
      className="rounded-2xl border p-4 mb-2 flex-row items-center"
      style={{
        backgroundColor: COLORS.card, borderColor: COLORS.border,
        shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
      }}
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: COLORS.primary + '14' }}
      >
        <LifeBuoy size={17} color={COLORS.primary} />
      </View>
      <View className="flex-1">
        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold mb-0.5">{t('support.needHelp')}</Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
          {t('support.available247')}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push('/support')}
        accessibilityRole="button"
        activeOpacity={0.85}
        className="flex-row items-center rounded-xl px-3 py-2"
        style={{ backgroundColor: COLORS.primary + '14' }}
      >
        <Text style={{ color: COLORS.primaryPressed }} className="text-[11px] font-bold mr-0.5">{t('support.contactSupport')}</Text>
        <ChevronRight size={13} color={COLORS.primaryPressed} />
      </TouchableOpacity>
    </View>
  );
};
