import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { useT } from '../../i18n';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  offline?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, offline }) => {
  const { t } = useT();
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <View className="items-center justify-center py-14 px-6">
      <View
        className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
        style={{ backgroundColor: COLORS.danger + '14' }}
      >
        <Icon size={24} color={COLORS.danger} />
      </View>
      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold text-center">
        {offline ? t('errorState.offline') : t('errorState.generic')}
      </Text>
      <Text
        style={{ color: COLORS.textSecondary }}
        className="text-xs text-center mt-1.5 leading-relaxed"
      >
        {message}
      </Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          accessibilityRole="button"
          className="flex-row items-center px-4 py-2.5 rounded-xl mt-4"
          style={{ backgroundColor: COLORS.primary }}
        >
          <RefreshCw size={14} color="#FFF" />
          <Text className="text-white font-bold text-xs ml-2">{t('common.tryAgain')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
