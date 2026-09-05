import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Spinner } from './Spinner';
import { CheckCircle2, Clock, CreditCard, PackageCheck, RefreshCw, X } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { billingRepository } from '../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../lib/razorpayCheckout';
import { ApiError } from '../lib/ApiError';
import { useAuthStore } from '../store/useAuthStore';
import type { ApiReturnSettlement } from '../types/api';
import { useT, type CopyKey } from '../i18n';

// The display predicates live in a pure, RN-free module so useRiderJourney can
// share them; re-exported here so existing importers keep working unchanged.
export { shouldShowSettlement } from '../lib/settlementDisplay';

/**
 * Settlement status -> translation key. The status VALUES are the API's and
 * are never translated; only what the rider reads in their place is.
 */
const STATUS_LABEL_KEY: Record<ApiReturnSettlement['status'], CopyKey> = {
  pending_refund: 'settlement.status.pending_refund',
  refund_processing: 'settlement.status.refund_processing',
  refund_completed: 'settlement.status.refund_completed',
  no_refund_required: 'settlement.status.no_refund_required',
  amount_due: 'settlement.status.amount_due',
  settlement_completed: 'settlement.status.settlement_completed',
};

/**
 * The status line's own colour and icon, rather than the card's.
 *
 * These states were all painted the same muted grey, so "Refund Pending" and
 * "Refund Completed" — the one line on this card that says whether the
 * rider's ₹2000 has actually moved — were visually identical. A rider had to
 * read the word to learn the outcome.
 *
 * Green is reserved for money that has ACTUALLY arrived. A refund the
 * business has merely promised is amber (waiting on us), and one the gateway
 * has accepted but not yet settled is brand blue-green (in flight, nothing
 * for anyone to do). `no_refund_required` and `settlement_completed` are
 * closed-and-fine, so they read as neutral rather than as a payout.
 */
const STATUS_STYLE: Record<
  ApiReturnSettlement['status'],
  { color: string; icon: React.ComponentType<{ size?: number; color?: string }> }
> = {
  pending_refund: { color: COLORS.warning, icon: Clock },
  refund_processing: { color: COLORS.primary, icon: RefreshCw },
  refund_completed: { color: COLORS.success, icon: CheckCircle2 },
  no_refund_required: { color: COLORS.textSecondary, icon: CheckCircle2 },
  amount_due: { color: COLORS.danger, icon: CreditCard },
  settlement_completed: { color: COLORS.textSecondary, icon: CheckCircle2 },
};

/**
 * The status line, as its own pill so the colour reads as a state badge
 * rather than as coloured body text.
 */
export function RefundStatusPill({ status }: { status: ApiReturnSettlement['status'] }) {
  const { t } = useT();
  const { color, icon: Icon } = STATUS_STYLE[status];
  return (
    <View
      className="self-start flex-row items-center px-2.5 py-1 rounded-full mt-3"
      style={{ backgroundColor: color + '1A' }}
    >
      <Icon size={12} color={color} />
      <Text style={{ color }} className="text-[11px] font-bold ml-1.5">
        {t(STATUS_LABEL_KEY[status])}
      </Text>
    </View>
  );
}

/**
 * Home only surfaces the settlement while money is actually due — once it
 * resolves (paid, refunded, or nothing owed either way), the push
 * notification plus Booking History already cover it, so the post-return
 * "Scooter Returned Successfully" confirmation card has no reason to keep
 * occupying Home.
 */
export function shouldShowSettlementOnHome(settlement: ApiReturnSettlement | null): boolean {
  return !!settlement && settlement.due_amount > 0 && settlement.status === 'amount_due';
}

/**
 * The order-creation/checkout/verify sequence for paying off a return
 * settlement's outstanding amount — the same one billing.tsx uses for every
 * other invoice payment on this app. Extracted so both the full
 * `SettlementCard` (My Scooter) and the compact consolidated status card
 * (Home) trigger the exact same payment flow rather than two copies that
 * can drift.
 */
export function usePaySettlement(settlement: ApiReturnSettlement, onPaid: () => void) {
  const { t } = useT();
  const profile = useAuthStore((s) => s.profile);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const pay = async () => {
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
        description: t('settlement.checkoutDescription'),
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
        setPayError(t('payment.failed'));
      }
    } finally {
      setPaying(false);
    }
  };

  return { pay, paying, payError };
}

/**
 * Post-return settlement summary — deposit/late-fee/damage breakdown plus
 * either the refund status or a "Pay ₹X" action for an outstanding due
 * amount. Reuses the exact same order-creation/checkout/verify sequence
 * billing.tsx already uses for every other invoice payment on this app.
 */
export function SettlementCard({
  settlement, onPaid, onDismiss,
}: {
  settlement: ApiReturnSettlement;
  onPaid: () => void;
  /**
   * Renders a close button on the informational (refund/settled) variant.
   * Deliberately NOT offered on the amount-due variant — that card carries
   * the only Pay button the rider has, and a banner you can dismiss your way
   * out of paying is a banner that costs the business money.
   */
  onDismiss?: () => void;
}) {
  const { t } = useT();
  const { pay, paying, payError } = usePaySettlement(settlement, onPaid);

  const isDue = settlement.due_amount > 0 && settlement.status === 'amount_due';
  const isRefund = settlement.refund_amount > 0;

  if (isDue) {
    return (
      <View
        className="rounded-2xl p-4 mb-4"
        style={{ backgroundColor: COLORS.danger + '14', borderWidth: 1, borderColor: COLORS.danger + '55' }}
      >
        <View className="flex-row items-center mb-1">
          <PackageCheck size={16} color={COLORS.danger} />
          <Text style={{ color: COLORS.danger }} className="text-xs font-extrabold ml-2">
            {t('settlement.returnSettlement')}
          </Text>
        </View>
        <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mt-2">
          ₹{settlement.due_amount.toFixed(0)}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5 mb-3">
          {t('settlement.additionalDue')}
        </Text>
        <TouchableOpacity
          onPress={() => void pay()}
          disabled={paying}
          className="py-3 rounded-xl items-center flex-row justify-center"
          style={{ backgroundColor: COLORS.danger, opacity: paying ? 0.6 : 1 }}
        >
          {paying ? <Spinner size={16} color="#FFF" /> : <CreditCard size={14} color="#FFF" />}
          <Text className="text-white text-xs font-bold ml-2">
            {paying
              ? t('settlement.processing')
              : t('scooterStatus.pay', { amount: `₹${settlement.due_amount.toFixed(0)}` })}
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
        {/* flex-1 so the headline wraps rather than pushing the close button
            off the row on a narrow handset. */}
        <Text style={{ color: COLORS.success }} className="text-xs font-extrabold ml-2 flex-1">
          {t('settlement.returnedSuccessfully')}
        </Text>
        {onDismiss ? (
          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('settlement.dismiss')}
            // The icon is 14px; the padding is what makes the tap target
            // reachable without enlarging the glyph.
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="-mr-1 -mt-1 p-1"
          >
            <X size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View className="mt-2">
        <SettlementLine label={t('settlement.securityDeposit')} amount={settlement.deposit_amount} />
        {settlement.late_fee_amount > 0 && <SettlementLine label={t('settlement.lateFee')} amount={-settlement.late_fee_amount} />}
        {settlement.damage_fee_amount > 0 && <SettlementLine label={t('settlement.damageFee')} amount={-settlement.damage_fee_amount} />}
        {settlement.other_charges.map((c, i) => (
          <SettlementLine key={i} label={c.label} amount={-c.amount} />
        ))}
      </View>

      {isRefund ? (
        <>
          <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
          <View className="flex-row items-center justify-between">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{t('settlement.refundAmount')}</Text>
            <Text style={{ color: COLORS.success }} className="text-lg font-black">
              ₹{settlement.refund_amount.toFixed(0)}
            </Text>
          </View>
        </>
      ) : null}

      <RefundStatusPill status={settlement.status} />
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
