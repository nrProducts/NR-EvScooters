import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Spinner } from './Spinner';
import { CheckCircle2, CreditCard, PackageCheck } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { billingRepository } from '../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../lib/razorpayCheckout';
import { ApiError } from '../lib/ApiError';
import { useAuthStore } from '../store/useAuthStore';
import type { ApiReturnSettlement } from '../types/api';

const STATUS_LABEL: Record<ApiReturnSettlement['status'], string> = {
  pending_refund: 'Refund Pending',
  refund_processing: 'Refund Processing',
  refund_completed: 'Refund Completed',
  no_refund_required: 'No Refund Required',
  amount_due: 'Amount Due',
  settlement_completed: 'Settlement Completed',
};

function isTerminal(status: ApiReturnSettlement['status']): boolean {
  return status === 'refund_completed' || status === 'settlement_completed' || status === 'no_refund_required';
}

/**
 * Whether the settlement is still worth showing on Home/My Scooter — always
 * while unresolved, and for a brief confirmation window after it resolves
 * (no backend "expiry" concept, purely a client display window).
 */
export function shouldShowSettlement(settlement: ApiReturnSettlement | null): boolean {
  if (!settlement) return false;
  if (!isTerminal(settlement.status)) return true;
  const resolvedAt = settlement.processed_at ? new Date(settlement.processed_at).getTime() : 0;
  return Date.now() - resolvedAt < 48 * 60 * 60 * 1000;
}

/**
 * Post-return settlement summary — deposit/late-fee/damage breakdown plus
 * either the refund status or a "Pay ₹X" action for an outstanding due
 * amount. Reuses the exact same order-creation/checkout/verify sequence
 * billing.tsx already uses for every other invoice payment on this app.
 */
export function SettlementCard({
  settlement, onPaid,
}: {
  settlement: ApiReturnSettlement;
  onPaid: () => void;
}) {
  const profile = useAuthStore((s) => s.profile);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const isDue = settlement.due_amount > 0 && settlement.status === 'amount_due';
  const isRefund = settlement.refund_amount > 0;

  const handlePay = async () => {
    if (!settlement.due_invoice_id) return;
    setPayError(null);
    setPaying(true);
    try {
      const order = await billingRepository.createOrderForInvoice(settlement.due_invoice_id);
      const verifyPayload = await openRazorpayCheckout({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.gatewayOrderId,
        description: 'Return Settlement',
        prefill: {
          email: profile?.email ?? undefined,
          contact: profile?.phone ?? undefined,
          name: profile?.full_name,
        },
        theme: { color: COLORS.primary },
      });
      await billingRepository.verifyPayment(verifyPayload);
      // onPaid() (loadSettlement) alone only refreshes this card's own data.
      // The return status card sitting right next to it, and any
      // has_active_rental-driven badge elsewhere, need their own refresh —
      // same reasoning as the late-fee gate's onPaid handler.
      void useAuthStore.getState().refreshProfile();
      onPaid();
    } catch (err) {
      if (err instanceof PaymentCancelledError || err instanceof PaymentUnavailableError) {
        setPayError(err.message);
      } else if (err instanceof ApiError) {
        setPayError(err.message);
      } else {
        setPayError('Payment failed. Please try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  if (isDue) {
    return (
      <View
        className="rounded-2xl p-4 mb-4"
        style={{ backgroundColor: COLORS.danger + '14', borderWidth: 1, borderColor: COLORS.danger + '55' }}
      >
        <View className="flex-row items-center mb-1">
          <PackageCheck size={16} color={COLORS.danger} />
          <Text style={{ color: COLORS.danger }} className="text-xs font-extrabold ml-2">
            Scooter Return Settlement
          </Text>
        </View>
        <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mt-2">
          ₹{settlement.due_amount.toFixed(0)}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5 mb-3">
          Additional amount due — please pay this to complete your return process.
        </Text>
        <TouchableOpacity
          onPress={() => void handlePay()}
          disabled={paying}
          className="py-3 rounded-xl items-center flex-row justify-center"
          style={{ backgroundColor: COLORS.danger, opacity: paying ? 0.6 : 1 }}
        >
          {paying ? <Spinner size={16} color="#FFF" /> : <CreditCard size={14} color="#FFF" />}
          <Text className="text-white text-xs font-bold ml-2">
            {paying ? 'Processing…' : `Pay ₹${settlement.due_amount.toFixed(0)}`}
          </Text>
        </TouchableOpacity>
        {payError ? (
          <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">{payError}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View
      className="rounded-2xl p-4 mb-4"
      style={{ backgroundColor: COLORS.success + '14', borderWidth: 1, borderColor: COLORS.success + '55' }}
    >
      <View className="flex-row items-center mb-1">
        <CheckCircle2 size={16} color={COLORS.success} />
        <Text style={{ color: COLORS.success }} className="text-xs font-extrabold ml-2">
          Scooter Returned Successfully
        </Text>
      </View>

      <View className="mt-2">
        <SettlementLine label="Security Deposit" amount={settlement.deposit_amount} />
        {settlement.late_fee_amount > 0 && <SettlementLine label="Late Fee" amount={-settlement.late_fee_amount} />}
        {settlement.damage_fee_amount > 0 && <SettlementLine label="Damage Fee" amount={-settlement.damage_fee_amount} />}
        {settlement.other_charges.map((c, i) => (
          <SettlementLine key={i} label={c.label} amount={-c.amount} />
        ))}
      </View>

      {isRefund ? (
        <>
          <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
          <View className="flex-row items-center justify-between">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Refund Amount</Text>
            <Text style={{ color: COLORS.success }} className="text-lg font-black">
              ₹{settlement.refund_amount.toFixed(0)}
            </Text>
          </View>
        </>
      ) : null}

      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold mt-3">
        Refund Status: {STATUS_LABEL[settlement.status]}
      </Text>
    </View>
  );
}

function SettlementLine({ label, amount }: { label: string; amount: number }) {
  return (
    <View className="flex-row items-center justify-between py-0.5">
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">{label}</Text>
      <Text style={{ color: amount < 0 ? COLORS.danger : COLORS.textPrimary }} className="text-xs font-semibold">
        {amount < 0 ? '-' : ''}₹{Math.abs(amount).toFixed(0)}
      </Text>
    </View>
  );
}
