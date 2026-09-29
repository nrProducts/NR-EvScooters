import React from 'react';
import { View, Text } from 'react-native';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import type { ApiDeposit } from '../types/api';
import { useT } from '../i18n';

/**
 * Where the rider's deposit stands, and what it would take to get it back.
 *
 * The rider app previously showed the deposit only as a line on an invoice
 * and inside a post-return settlement. Neither answers the question a rider
 * with a live rental actually has — "when do I get my money back" — which
 * now has a condition attached to it (a minimum number of rental days). A
 * condition the rider cannot see the progress of is one they will call
 * support about.
 *
 * The onboarding charge is not shown here: it is not part of this deposit
 * and never comes back, so listing it beside a refund progress bar would
 * suggest it might.
 */
export function DepositStatusCard({
  deposit,
  onboardingCharge,
}: {
  deposit: ApiDeposit;
  onboardingCharge?: number;
}) {
  const { t } = useT();

  const hasThreshold = deposit.min_rental_days_required > 0;
  const forfeited = deposit.status === 'forfeited';
  const refunded = deposit.refund_eligibility === 'refund_processed';
  const eligible = deposit.refund_eligibility === 'eligible';
  const nonRefundable = !forfeited && !refunded && !deposit.is_refundable;

  const tone = forfeited || nonRefundable
    ? COLORS.danger
    : refunded || eligible
      ? COLORS.success
      : COLORS.textSecondary;

  const Icon = forfeited || nonRefundable ? XCircle : refunded || eligible ? CheckCircle2 : Clock;

  // A flat statement of the rule, not a live day-by-day counter — a rider
  // mid-rental doesn't need a running tally to know their money is safe,
  // just the one condition that has to be met before it's refundable.
  const statusLine = forfeited
    ? (deposit.forfeit_reason ?? t('deposit.forfeited'))
    : refunded
      ? t('deposit.refunded')
      : nonRefundable
        ? t('deposit.nonRefundable')
        : eligible
          ? t('deposit.eligible')
          : hasThreshold
            ? t('deposit.refundableAfterDays', { days: deposit.min_rental_days_required })
            : t('deposit.afterReturn');

  return (
    <View
      className="rounded-2xl p-4 mb-4"
      style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
    >
      <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
        <ShieldCheck size={16} color={COLORS.primary} />
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
          {t('deposit.title')}
        </Text>
      </View>

      <View className="flex-row items-baseline justify-between mb-1">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          {t('deposit.securityDeposit')}
        </Text>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">
          ₹{deposit.amount.toFixed(0)}
        </Text>
      </View>

      {deposit.refundable_amount !== deposit.amount && !forfeited ? (
        <View className="flex-row items-baseline justify-between mb-1">
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
            {t('deposit.refundableNow')}
          </Text>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
            ₹{deposit.refundable_amount.toFixed(0)}
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-start mt-2" style={{ gap: 6 }}>
        <Icon size={13} color={tone} style={{ marginTop: 1 }} />
        <Text style={{ color: tone }} className="text-[11px] font-medium flex-1 leading-4">
          {statusLine}
        </Text>
      </View>

      {onboardingCharge && onboardingCharge > 0 ? (
        <Text
          style={{ color: COLORS.textSecondary, borderTopWidth: 1, borderTopColor: COLORS.border }}
          className="text-[11px] font-medium mt-3 pt-2 leading-4"
        >
          {t('deposit.onboardingNote', { amount: `₹${onboardingCharge.toFixed(0)}` })}
        </Text>
      ) : null}
    </View>
  );
}
