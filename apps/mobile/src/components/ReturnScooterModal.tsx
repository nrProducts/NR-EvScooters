import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Spinner } from './Spinner';
// Library version, not RN's: RN's only really works on iOS, and Android is
// edge-to-edge from SDK 54 so the window no longer resizes for the keyboard.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, AlertTriangle } from 'lucide-react-native';
import { ChipSelect } from './ui/ChipSelect';
import { FormField } from './ui/FormField';
import { StarRating } from './ui/StarRating';
import { COLORS } from '../constants/theme';
import {
  LATE_RETURN_FEE_PER_DAY, RETURN_REASONS, RETURN_REASON_LABEL_KEY, returnDeadlineFor,
  type ReturnReason,
} from '../lib/returnPolicy';
import { useRequestReturn } from '../hooks/useRequestReturn';
import type { ApiRental } from '../types/api';
import { useT } from '../i18n';

interface ReturnScooterModalProps {
  visible: boolean;
  rental: ApiRental;
  onClose: () => void;
  /** Fired after a successful request so the screen can refresh its rental. */
  onSubmitted?: () => void;
}

/**
 * The deadline this request will actually carry — an estimate; the server's
 * value wins after submitting.
 *
 * Clamped to the plan's expiry exactly as requestReturn does on the backend.
 * Without the clamp a rider already past expires_at would be told "return by
 * today, no fee" and then charged for the days they'd already run over.
 */
function deadlineFor(rental: ApiRental): { date: Date; alreadyOverdue: boolean } {
  const requestDeadline = returnDeadlineFor(new Date());
  const expiresAt = rental.expires_at ? new Date(rental.expires_at) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < requestDeadline) {
    return { date: expiresAt, alreadyOverdue: true };
  }
  return { date: requestDeadline, alreadyOverdue: false };
}

const formatDeadline = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const ReturnScooterModal: React.FC<ReturnScooterModalProps> = ({
  visible, rental, onClose, onSubmitted,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { submitting, requestReturn } = useRequestReturn();

  // Built inside the component, not at module scope, so a language change
  // re-renders these labels like everything else.
  const REASON_OPTIONS = RETURN_REASONS.map((key) => ({ key, label: t(RETURN_REASON_LABEL_KEY[key]) }));

  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const deadline = deadlineFor(rental);
  // The configured rate the server sent with the rental — never this app's
  // fallback constant, which had drifted from what the console was showing.
  const lateReturnFeePerDay = rental.late_return_fee_per_day ?? LATE_RETURN_FEE_PER_DAY;

  const reset = () => {
    setReason('');
    setFeedback('');
    setRating(0);
    setErrors({});
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!reason) next.reason = t('returnModal.error.reason');
    if (!rating) next.rating = t('returnModal.error.rating');
    // Mirrors the backend's superRefine so the rider isn't bounced by a 400.
    if (reason === 'other' && !feedback.trim()) next.feedback = t('returnModal.error.feedback');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const ok = await requestReturn(rental, {
      reason: reason as ReturnReason,
      feedback: feedback.trim() || undefined,
      rating,
    });
    if (ok) {
      reset();
      onSubmitted?.();
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
      >
        <View
          style={{
            backgroundColor: COLORS.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '90%',
          }}
        >
          <View className="flex-row justify-between items-center px-6 pt-6 pb-4">
            <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
              {t('returnModal.title')}
            </Text>
            <TouchableOpacity
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: COLORS.background }}
            >
              <X size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            className="px-6"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            <ChipSelect
              label={t('returnModal.reasonLabel')}
              required
              options={REASON_OPTIONS}
              value={reason as ReturnReason}
              onChange={(v) => {
                setReason(v);
                if (errors.reason) setErrors((e) => ({ ...e, reason: '' }));
              }}
              error={errors.reason}
            />

            <FormField
              label={t('returnModal.feedbackLabel')}
              value={feedback}
              onChangeText={(v) => {
                setFeedback(v);
                if (errors.feedback) setErrors((e) => ({ ...e, feedback: '' }));
              }}
              placeholder={t('returnModal.feedbackPlaceholder')}
              multiline
              required={reason === 'other'}
              error={errors.feedback}
            />

            <StarRating
              label={t('returnModal.ratingLabel')}
              required
              value={rating}
              onChange={(v) => {
                setRating(v);
                if (errors.rating) setErrors((e) => ({ ...e, rating: '' }));
              }}
              error={errors.rating}
            />
            {/* Commenting this becasue overdue is first should pay then only we can request return scooter */}
            {/* <View
              className="rounded-2xl p-3.5 mb-3"
              style={{
                backgroundColor: (deadline.alreadyOverdue ? COLORS.danger : COLORS.warning) + '14',
                borderWidth: 1,
                borderColor: (deadline.alreadyOverdue ? COLORS.danger : COLORS.warning) + '33',
              }}
            >
              <View className="flex-row items-center mb-1">
                <AlertTriangle size={14} color={deadline.alreadyOverdue ? COLORS.danger : COLORS.warning} />
                <Text
                  style={{ color: deadline.alreadyOverdue ? COLORS.danger : COLORS.warning }}
                  className="text-xs font-extrabold ml-2"
                >
                  {deadline.alreadyOverdue
                    ? `Your plan ended ${formatDeadline(deadline.date)}`
                    : `Return by ${formatDeadline(deadline.date)}, 11:59 PM`}
                </Text>
              </View>
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
                {lateReturnFeePerDay <= 0
                  ? deadline.alreadyOverdue
                    ? 'Hand the scooter back to our team to close your plan.'
                    : 'Our team will confirm the handover at the station.'
                  : deadline.alreadyOverdue
                    ? `A ₹${lateReturnFeePerDay}/day late fee has already been accruing since then, and will be charged when our team confirms the handover.`
                    : `Each day after that adds a ₹${lateReturnFeePerDay} late fee, charged when our team confirms the handover.`}
              </Text>
            </View> */}

            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed mb-2">
              {t('returnModal.policyNote')}
            </Text>
          </ScrollView>

          <View className="px-6 pt-2" style={{ paddingBottom: 16 + insets.bottom }}>
            <TouchableOpacity
              onPress={() => void submit()}
              disabled={submitting}
              accessibilityRole="button"
              className="w-full py-4 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: COLORS.primary, opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? (
                <Spinner size={18} color="#FFF" />
              ) : (
                <Text className="text-white font-bold text-sm">{t('returnModal.submit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
