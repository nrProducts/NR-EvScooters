import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, CheckCircle2, ChevronRight, Info } from 'lucide-react-native';
import { Sheet } from './Sheet';
import { COLORS } from '../../constants/theme';
import type { DialogRequest, DialogResult, DialogTone } from '../../store/useDialogStore';

const TONE_COLOR: Record<DialogTone, string> = {
  default: COLORS.primary,
  danger: COLORS.danger,
  success: COLORS.success,
};

const TONE_ICON = {
  default: Info,
  danger: AlertTriangle,
  success: CheckCircle2,
};

interface DialogSheetProps {
  request: DialogRequest | null;
  onClose: (value: DialogResult) => void;
}

/**
 * Themed stand-in for Alert.alert / Alert.prompt / an action sheet. Presentational
 * only — see useDialogStore for how a request gets here, and lib/confirm.ts for
 * the imperative API screens actually call.
 */
export const DialogSheet: React.FC<DialogSheetProps> = ({ request, onClose }) => {
  const [value, setValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const tone: DialogTone = request?.tone ?? 'default';
  const accent = TONE_COLOR[tone];
  const Icon = TONE_ICON[tone];

  // A confirm that is dismissed by tapping outside must read as "no".
  const dismissValue: DialogResult = request?.kind === 'confirm' ? false : null;

  const submitPrompt = () => {
    if (request?.kind !== 'prompt') return;
    const trimmed = value.trim();
    const error = request.validate?.(trimmed) ?? null;
    if (error) {
      setInputError(error);
      return;
    }
    onClose(trimmed);
  };

  return (
    <Sheet visible={request !== null} onClose={() => onClose(dismissValue)}>
      {request ? (
        <View className="px-6 pt-6">
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center mb-4"
            style={{ backgroundColor: accent + '1A' }}
          >
            <Icon size={22} color={accent} />
          </View>

          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
            {request.title}
          </Text>
          {request.message ? (
            <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium leading-relaxed mt-2">
              {request.message}
            </Text>
          ) : null}

          {request.kind === 'prompt' ? (
            <View className="mt-4">
              <TextInput
                value={value}
                onChangeText={(t) => {
                  setValue(t);
                  if (inputError) setInputError(null);
                }}
                placeholder={request.placeholder}
                placeholderTextColor={COLORS.textSecondary}
                multiline={request.multiline}
                autoFocus
                accessibilityLabel={request.title}
                className="rounded-2xl px-4 py-3.5 text-base font-semibold border"
                style={{
                  color: COLORS.textPrimary,
                  backgroundColor: COLORS.background,
                  borderColor: inputError ? COLORS.danger : COLORS.border,
                  minHeight: request.multiline ? 96 : undefined,
                  textAlignVertical: request.multiline ? 'top' : 'center',
                }}
              />
              {inputError ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mt-2">
                  {inputError}
                </Text>
              ) : null}
            </View>
          ) : null}

          {request.kind === 'actions' ? (
            <ScrollView className="mt-4" style={{ maxHeight: 320 }}>
              <View style={{ gap: 10 }}>
                {request.options.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => onClose(option.key)}
                    accessibilityRole="button"
                    className="rounded-2xl px-4 py-4 border flex-row items-center justify-between"
                    style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                  >
                    <Text
                      style={{ color: TONE_COLOR[option.tone ?? 'default'] === COLORS.danger ? COLORS.danger : COLORS.textPrimary }}
                      className="text-sm font-bold"
                    >
                      {option.label}
                    </Text>
                    <ChevronRight size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : null}

          <View className="mt-5" style={{ gap: 10 }}>
            {request.kind === 'confirm' || request.kind === 'prompt' ? (
              <TouchableOpacity
                onPress={() => (request.kind === 'prompt' ? submitPrompt() : onClose(true))}
                accessibilityRole="button"
                className="py-4 rounded-2xl items-center"
                style={{ backgroundColor: accent }}
              >
                <Text className="text-white text-sm font-bold">{request.confirmLabel}</Text>
              </TouchableOpacity>
            ) : null}

            {request.kind === 'alert' ? (
              <TouchableOpacity
                onPress={() => onClose(null)}
                accessibilityRole="button"
                className="py-4 rounded-2xl items-center"
                style={{ backgroundColor: accent }}
              >
                <Text className="text-white text-sm font-bold">{request.confirmLabel ?? 'OK'}</Text>
              </TouchableOpacity>
            ) : null}

            {request.kind !== 'alert' ? (
              <TouchableOpacity
                onPress={() => onClose(dismissValue)}
                accessibilityRole="button"
                className="py-4 rounded-2xl items-center border"
                style={{ borderColor: COLORS.border }}
              >
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
                  {request.cancelLabel ?? 'Cancel'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
};
