import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Clock, AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { rentalRepository } from '../services';
import { computeLateReturnPenalty, describeReturnDeadline } from '../lib/returnPolicy';
import type { ApiRental, ApiReturnStage } from '../types/api';
import { useT, type CopyKey } from '../i18n';

interface ReturnStatusCardProps {
  rental: ApiRental;
  /** Tighter padding for the Home card, where space is at a premium. */
  compact?: boolean;
}

/**
 * Stage → translation key. The stage VALUES are the API's
 * (`payment_required`, …) and are never translated or compared against
 * translated text; only the headline the rider reads is.
 */
const STAGE_HEADLINE_KEY: Partial<Record<ApiReturnStage['status'], CopyKey>> = {
  payment_required: 'returnStatus.stage.payment_required',
  payment_submitted: 'returnStatus.stage.payment_submitted',
  ready_for_approval: 'returnStatus.stage.ready_for_approval',
  return_completed: 'returnStatus.stage.return_completed',
};

/**
 * Shown wherever a "Return Scooter" button would otherwise sit, once a return
 * has been requested OR the rental has been flagged for recovery. The rental
 * is still active at this point — the rider keeps the scooter until staff
 * confirm the handover — so every surface has to explain that rather than
 * looking like nothing happened.
 *
 * recovery_flagged_at can be set with NO return ever requested — that is the
 * whole point of vehicle-recovery-sweep: catching a rider who never opened
 * the return flow at all. So this renders on that flag alone, not just on
 * return_requested_at.
 *
 * Also self-fetches the Vehicle Return → Inspection → Payment Gate → Approve
 * Return stage (GET /rentals/me/return-stage) — a SEPARATE concept from the
 * return-lateness math below: that's about the physical scooter coming back
 * late, this is about whether admin's inspection found damage/other charges
 * still owed before the return can be approved. Self-fetching on focus
 * (rather than depending on a parent-supplied prop) means this card stays
 * correct regardless of which screen or payment flow triggered the change —
 * SettlementCard's "Pay ₹X", the late-fee gate, or admin verifying payment
 * server-side while the rider isn't even looking at the app.
 */
export const ReturnStatusCard: React.FC<ReturnStatusCardProps> = ({ rental, compact }) => {
  const { t } = useT();
  const [stage, setStage] = useState<ApiReturnStage | null>(null);

  const loadStage = useCallback(() => {
    void rentalRepository.returnStage().then(setStage).catch(() => {
      // Non-critical: the return-lateness card below still renders without it.
    });
  }, []);

  useEffect(loadStage, [loadStage]);
  const loadStageRef = useRef(loadStage);
  loadStageRef.current = loadStage;
  useFocusEffect(
    useCallback(() => {
      loadStageRef.current();
    }, []),
  );

  const hasPaymentGateStage = stage
    && stage.status !== 'return_requested' && stage.status !== 'rejected';

  if (!rental.return_requested_at && !rental.recovery_flagged_at && !hasPaymentGateStage) return null;

  const charge = computeLateReturnPenalty({
    returnDueAt: rental.return_due_at,
    maxDays: rental.max_late_fee_days,
    // The configured rate the server sent, not this app's fallback constant.
    feePerDay: rental.late_return_fee_per_day,
  });
  const recoveryRequired = !!rental.recovery_flagged_at;
  // A return already requested is informational, not a warning — the rider
  // has already acted, so "Overdue by N days" here would just be alarming
  // noise on top of the return-stage panel below that already explains
  // what's happening. Lateness only reads as a warning before the rider has
  // requested a return at all.
  const overdue = charge.isLate && !rental.return_requested_at;
  const tint = recoveryRequired || overdue ? COLORS.danger : COLORS.warning;
  const Icon = recoveryRequired || overdue ? AlertTriangle : Clock;

  return (
    <View>
      {rental.return_requested_at || rental.recovery_flagged_at ? (
        <View
          className={`rounded-2xl ${compact ? 'p-3' : 'p-4'} mt-3`}
          style={{ backgroundColor: tint + '14', borderWidth: 1, borderColor: tint + '33' }}
        >
          <View className="flex-row items-center mb-1">
            <Icon size={14} color={tint} />
            <Text style={{ color: tint }} className="text-xs font-extrabold ml-2">
              {recoveryRequired
                ? t('scooterStatus.recoveryRequired')
                : overdue
                  ? charge.daysLate === 1
                    ? t('returnStatus.overdueOne')
                    : t('returnStatus.overdueOther', { count: charge.daysLate })
                  : t('returnStatus.returnRequested')}
            </Text>
          </View>
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
            {recoveryRequired
              ? t(
                  rental.max_late_fee_days === 1
                    ? 'returnStatus.recoveryBody.one'
                    : 'returnStatus.recoveryBody.other',
                  { amount: `₹${charge.penaltyAmount}`, days: rental.max_late_fee_days },
                )
              : overdue
                ? t('returnStatus.overdueBody', { amount: `₹${charge.penaltyAmount}` })
                : rental.return_requested_at
                  ? t('scooterStatus.returnRequested.body')
                  : t('returnStatus.handInBy', {
                      deadline: describeReturnDeadline(rental.return_due_at, t),
                    })}
          </Text>
        </View>
      ) : null}

      {hasPaymentGateStage && stage ? <ReturnStagePanel stage={stage} compact={compact} /> : null}
    </View>
  );
};

function ReturnStagePanel({ stage, compact }: { stage: ApiReturnStage; compact?: boolean }) {
  const { t } = useT();
  const tint = stage.status === 'payment_required'
    ? COLORS.danger
    : stage.status === 'payment_submitted'
      ? COLORS.warning
      : COLORS.success;
  const Icon = stage.status === 'payment_required'
    ? CreditCard
    : stage.status === 'payment_submitted'
      ? Clock
      : CheckCircle2;

  return (
    <View
      className={`rounded-2xl ${compact ? 'p-3' : 'p-4'} mt-3`}
      style={{ backgroundColor: tint + '14', borderWidth: 1, borderColor: tint + '33' }}
    >
      <View className="flex-row items-center mb-1">
        <Icon size={14} color={tint} />
        <Text style={{ color: tint }} className="text-xs font-extrabold ml-2">
          {/* An unmapped stage falls back to the raw API value rather than to
              a guess. It is not a rider-facing word, but it is honest, and it
              is what a support call needs to hear read out. */}
          {t('returnStatus.stagePrefix', {
            stage: STAGE_HEADLINE_KEY[stage.status]
              ? t(STAGE_HEADLINE_KEY[stage.status]!)
              : stage.status,
          })}
        </Text>
      </View>
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
        {stage.status === 'payment_required'
          ? t('returnStatus.stageBody.paymentRequired', {
              amount: `₹${stage.additionalDue.toFixed(0)}`,
            })
          : stage.status === 'payment_submitted'
            ? t('returnStatus.stageBody.paymentSubmitted')
            : stage.status === 'ready_for_approval'
              ? t('returnStatus.stageBody.readyForApproval')
              : t('returnStatus.stageBody.completed')}
      </Text>
    </View>
  );
}
