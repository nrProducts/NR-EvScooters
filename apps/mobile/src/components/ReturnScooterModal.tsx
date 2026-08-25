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
  LATE_RETURN_FEE_PER_DAY, RETURN_REASONS, RETURN_REASON_LABEL, returnDeadlineFor,
  type ReturnReason,
} from '../lib/returnPolicy';
import { useRequestReturn } from '../hooks/useRequestReturn';
import type { ApiRental } from '../types/api';

interface ReturnScooterModalProps {
  visible: boolean;
  rental: ApiRental;
  onClose: () => void;
  /** Fired after a successful request so the screen can refresh its rental. */
  onSubmitted?: () => void;
}

const REASON_OPTIONS = RETURN_REASONS.map((key) => ({ key, label: RETURN_REASON_LABEL[key] }));

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
  const { submitting, requestReturn } = useRequestReturn();

  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const deadline = deadlineFor(rental);
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
    if (!reason) next.reason = 'Pick a reason.';
    if (!rating) next.rating = 'Rate your ride.';
    // Mirrors the backend's superRefine so the rider isn't bounced by a 400.
    if (reason === 'other' && !feedback.trim()) next.feedback = 'Tell us a bit more.';
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
              Return Scooter
            </Text>
            <TouchableOpacity
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
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
              label="Why are you returning?"
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
              label="Anything you'd like us to know?"
              value={feedback}
              onChangeText={(t) => {
                setFeedback(t);
                if (errors.feedback) setErrors((e) => ({ ...e, feedback: '' }));
              }}
              placeholder="Tell us how the ride went"
              multiline
              required={reason === 'other'}
              error={errors.feedback}
            />

            <StarRating
              label="Rate your ride"
              required
              value={rating}
              onChange={(v) => {
                setRating(v);
                if (errors.rating) setErrors((e) => ({ ...e, rating: '' }));
              }}
              error={errors.rating}
            />

            <View
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
                {deadline.alreadyOverdue
                  ? `A ₹${lateReturnFeePerDay}/day late fee has already been accruing since then, and will be charged when our team confirms the handover.`
                  : `Each day after that adds a ₹${lateReturnFeePerDay} late fee, charged when our team confirms the handover.`}
              </Text>
            </View>

            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed mb-2">
              Your request will be processed as per our return policy. The rental stays active — and the
              scooter stays yours — until our team confirms the physical handover at the station. Nothing
              is charged now; payment collection goes live in a later update. Need to change this
              afterwards? Contact support.
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
                <Text className="text-white font-bold text-sm">Request Return</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
