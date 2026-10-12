import React from 'react';
import { View, Text } from 'react-native';
import { CheckCircle2, Clock, RefreshCw, Wallet, XCircle } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import type { ApiRefund, RefundStatus, RefundType } from '../types/api';
import { useT, type CopyKey } from '../i18n';

/**
 * A refund the rider is owed OUTSIDE a return settlement — a cancelled
 * booking, a deposit release off-cycle, a goodwill credit. The settlement
 * refund (post-return) already has its own card; `refund_type ===
 * 'settlement'` is filtered out before this ever renders, so the two never
 * show the same money twice.
 *
 * Same amber→blue→green→red status language as SettlementCard's
 * RefundStatusPill, reused rather than reinvented: waiting on us, in flight
 * at the gateway, arrived, or rejected/failed.
 */
const STATUS_LABEL_KEY: Record<RefundStatus, CopyKey> = {
    pending: 'refundCard.status.pending',
    processing: 'refundCard.status.processing',
    succeeded: 'refundCard.status.succeeded',
    failed: 'refundCard.status.failed',
    rejected: 'refundCard.status.rejected',
};

const STATUS_STYLE: Record<RefundStatus, { color: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
    pending: { color: COLORS.warning, icon: Clock },
    processing: { color: COLORS.primary, icon: RefreshCw },
    succeeded: { color: COLORS.success, icon: CheckCircle2 },
    failed: { color: COLORS.danger, icon: XCircle },
    rejected: { color: COLORS.danger, icon: XCircle },
};

const REASON_LABEL_KEY: Record<RefundType, CopyKey> = {
    booking_cancellation: 'refundCard.reason.booking_cancellation',
    deposit_release: 'refundCard.reason.deposit_release',
    settlement: 'refundCard.reason.settlement',
    goodwill: 'refundCard.reason.goodwill',
};

function RefundStatusPill({ status }: { status: RefundStatus }) {
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

function DeductionLine({ label, amount }: { label: string; amount: number }) {
    return (
        <View className="flex-row items-center justify-between py-0.5">
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">{label}</Text>
            <Text style={{ color: COLORS.danger }} className="text-xs font-semibold">-₹{amount.toFixed(0)}</Text>
        </View>
    );
}

export function RefundStatusCard({ refund }: { refund: ApiRefund }) {
    const { t } = useT();

    return (
        <View
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}
        >
            <View className="flex-row items-center">
                <Wallet size={16} color={COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold ml-2 flex-1">
                    {t(REASON_LABEL_KEY[refund.refund_type])}
                </Text>
            </View>

            {refund.deduction_total > 0 ? (
                <View className="mt-3">
                    {refund.deductions.cancellation_charge > 0 && (
                        <DeductionLine
                            label={t('refundCard.cancellationCharge')}
                            amount={refund.deductions.cancellation_charge}
                        />
                    )}
                    {refund.deductions.transaction_fee > 0 && (
                        <DeductionLine label={t('refundCard.transactionFee')} amount={refund.deductions.transaction_fee} />
                    )}
                    {refund.deductions.other_charges > 0 && (
                        <DeductionLine label={t('refundCard.otherCharges')} amount={refund.deductions.other_charges} />
                    )}
                    <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                </View>
            ) : null}

            <View className="flex-row items-center justify-between mt-1">
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                    {t('refundCard.refundAmount')}
                </Text>
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
                    ₹{refund.amount.toFixed(0)}
                </Text>
            </View>

            <RefundStatusPill status={refund.status} />

            {refund.status === 'rejected' && refund.rejection_reason ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2">
                    {refund.rejection_reason}
                </Text>
            ) : null}
            {refund.status === 'failed' ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2">
                    {t('refundCard.willRetry')}
                </Text>
            ) : null}
        </View>
    );
}
