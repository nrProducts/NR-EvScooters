import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, X } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { InfoHint } from './ui/InfoHint';
import { COLORS } from '../constants/theme';
import {
  LATE_FEE_POLICY_TITLE, lateFeePolicyExample, lateFeePolicySections,
} from '../constants/lateFeePolicy';
import { billingRepository, rentalRepository } from '../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../lib/razorpayCheckout';
import { ApiError } from '../lib/ApiError';
import { useAuthStore } from '../store/useAuthStore';
import { formatDate } from '../constants/status';
import type { ApiOverdueLateFee, ApiRental } from '../types/api';

interface LateFeePaymentModalProps {
  visible: boolean;
  rental: ApiRental;
  lateFee: ApiOverdueLateFee;
  onClose: () => void;
  /** Fired once the payment is confirmed — the caller opens the real return form next. */
  onPaid: () => void;
}

/**
 * Overdue Rider → Late Fee Payment → Scooter Return, step one.
 *
 * An overdue rider (their plan's due date has passed, unpaid) owes the same
 * renewal late fee a late RENEWAL would charge — see apps/backend/src/
 * modules/rentals/overdueLateFee.ts. This blocks "Return Scooter" until it's
 * paid: ReturnGate renders this INSTEAD OF ReturnScooterModal whenever
 * lateFee.isSettled is false, and only swaps to the real return form once
 * handlePay resolves.
 *
 * Reuses the exact order-creation/checkout/verify sequence every other
 * invoice payment in this app already uses (see SettlementCard.tsx) —
 * rentalRepository.payOverdueLateFee() only creates/reuses the payable
 * invoice; billingRepository is what actually charges it.
 */
export const LateFeePaymentModal: React.FC<LateFeePaymentModalProps> = ({
  visible, rental, lateFee, onClose, onPaid,
}) => {
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const handlePay = async () => {
    setPayError(null);
    setPaying(true);
    try {
      const invoice = await rentalRepository.payOverdueLateFee();
      if (!invoice.isPaid) {
        const order = await billingRepository.createOrderForInvoice(invoice.invoiceId);
        const verifyPayload = await openRazorpayCheckout({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          order_id: order.gatewayOrderId,
          description: 'Overdue Plan — Late Fee',
          prefill: {
            email: profile?.email ?? undefined,
            contact: profile?.phone ?? undefined,
            name: profile?.full_name,
          },
          theme: { color: COLORS.primary },
        });
        await billingRepository.verifyPayment(verifyPayload);
      }
      onPaid();
    } catch (err) {
      if (err instanceof PaymentCancelledError || err instanceof PaymentUnavailableError) {
        setPayError(err.message);
      } else if (err instanceof ApiError) {
        setPayError(err.message);
      } else {
        setPayError('Your late fee payment was not completed. Please try again to continue the return process.');
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
      >
        <View
          style={{
            backgroundColor: COLORS.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
        >
          <View className="flex-row justify-between items-center px-6 pt-6 pb-2">
            <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
              Late Fee Payment Required
            </Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: COLORS.background }}
            >
              <X size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View className="px-6 pb-2">
            <View
              className="rounded-2xl p-3.5 mb-4"
              style={{ backgroundColor: COLORS.danger + '14', borderWidth: 1, borderColor: COLORS.danger + '33' }}
            >
              <View className="flex-row items-center mb-1">
                <AlertTriangle size={14} color={COLORS.danger} />
                <Text style={{ color: COLORS.danger }} className="text-xs font-extrabold ml-2">
                  Plan Expired
                </Text>
              </View>
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
                Your plan has expired and a late fee is pending. Please complete the late fee payment before
                returning the scooter.
              </Text>
            </View>

            <DetailLine label="Rider" value={profile?.full_name ?? '—'} />
            {rental.vehicle ? (
              <DetailLine label="Vehicle" value={rental.vehicle.registration_number} />
            ) : null}
            {lateFee.dueOn ? <DetailLine label="Plan Ended" value={formatDate(lateFee.dueOn)} /> : null}
            {/* The ⓘ earns its place on THIS line specifically: this count
                includes today (the rider is handing the scooter back having
                ridden it), so it is deliberately one day more than the renew
                banner on Home quotes for the same date. Without the
                explanation that reads as one of the two screens being wrong. */}
            <DetailLine
              label="Overdue"
              value={`${lateFee.daysLate} day${lateFee.daysLate > 1 ? 's' : ''}`}
              info={
                <InfoHint
                  title={LATE_FEE_POLICY_TITLE}
                  sections={lateFeePolicySections(lateFee.feePerDay)}
                  example={lateFeePolicyExample(lateFee.feePerDay)}
                />
              }
            />
            <DetailLine label="Late Fee" value={`₹${lateFee.lateFee.toFixed(0)}`} />

            <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />

            <View className="flex-row items-center justify-between mb-4">
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Amount Due</Text>
              <Text style={{ color: COLORS.danger }} className="text-lg font-black">
                ₹{lateFee.lateFee.toFixed(0)}
              </Text>
            </View>
          </View>

          <View className="px-6 pt-1" style={{ paddingBottom: 16 + insets.bottom }}>
            <TouchableOpacity
              onPress={() => void handlePay()}
              disabled={paying}
              accessibilityRole="button"
              className="w-full py-4 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: COLORS.danger, opacity: paying ? 0.6 : 1 }}
            >
              {paying ? (
                <Spinner size={18} color="#FFF" />
              ) : (
                <Text className="text-white font-bold text-sm">Pay Late Fee — ₹{lateFee.lateFee.toFixed(0)}</Text>
              )}
            </TouchableOpacity>
            {payError ? (
              <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">
                {payError}
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

function DetailLine({ label, value, info }: { label: string; value: string; info?: React.ReactNode }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <View className="flex-row items-center">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">{label}</Text>
        {info}
      </View>
      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">{value}</Text>
    </View>
  );
}
