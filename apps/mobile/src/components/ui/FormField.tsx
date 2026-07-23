import React, { forwardRef } from 'react';
import {
  View, Text, TextInput, KeyboardTypeOptions, ReturnKeyTypeOptions,
} from 'react-native';
import { COLORS } from '../../constants/theme';

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  required?: boolean;
  /** Server- or client-side message for this field; turns the border red. */
  error?: string;
  editable?: boolean;
  multiline?: boolean;
  hint?: string;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
}

/**
 * Same visual language as the inline field in vehicles.tsx, extended with the
 * required marker, error text and disabled state the user forms need.
 * Forwards its ref to the underlying TextInput so callers can chain
 * "Next"-key focus between fields (see profile-setup.tsx).
 */
export const FormField = forwardRef<TextInput, FormFieldProps>(({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize,
  required, error, editable = true, multiline, hint, returnKeyType, onSubmitEditing,
}, ref) => (
  <View className="mb-3.5">
    <View className="flex-row items-center mb-1.5">
      <Text
        style={{ color: COLORS.textSecondary }}
        className="text-[11px] font-bold uppercase tracking-wider"
      >
        {label}
      </Text>
      {required ? (
        <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1">*</Text>
      ) : null}
    </View>

    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textSecondary}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize={autoCapitalize ?? 'sentences'}
      editable={editable}
      multiline={multiline}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      blurOnSubmit={!multiline && !!onSubmitEditing}
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="rounded-xl px-3.5 py-3 text-sm font-semibold border"
      style={{
        backgroundColor: editable ? COLORS.background : COLORS.gray[100],
        borderColor: error ? COLORS.danger : COLORS.border,
        color: editable ? COLORS.textPrimary : COLORS.textSecondary,
        minHeight: multiline ? 88 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />

    {error ? (
      <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mt-1.5">
        {error}
      </Text>
    ) : hint ? (
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-1.5">
        {hint}
      </Text>
    ) : null}
  </View>
));

FormField.displayName = 'FormField';
