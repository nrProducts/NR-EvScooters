import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Clock, AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { rentalRepository } from '../services';
import { computeLateReturnPenalty, describeReturnDeadline } from '../lib/returnPolicy';
import type { ApiRental, ApiReturnStage } from '../types/api';

interface ReturnStatusCardProps {
  rental: ApiRental;
  /** Tighter padding for the Home card, where space is at a premium. */
  compact?: boolean;
}

const STAGE_HEADLINE: Partial<Record<ApiReturnStage['status'], string>> = {
  payment_required: 'Payment Required',
  payment_submitted: 'Payment Submitted',
  ready_for_approval: 'Payment Verified — Ready for Approval',
  return_completed: 'Return Completed',
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
                ? 'Vehicle Recovery Required'
                : overdue
                  ? `Overdue by ${charge.daysLate} day${charge.daysLate > 1 ? 's' : ''}`
                  : 'Return requested'}
            </Text>
          </View>
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
            {recoveryRequired
              ? `A ₹${charge.penaltyAmount} late fee applies (capped at ${rental.max_late_fee_days} day${rental.max_late_fee_days > 1 ? 's' : ''}) and our team is on the way to collect the scooter. Please make it available for pickup.`
              : overdue
                ? `A ₹${charge.penaltyAmount} late fee has built up so far, and will be charged when our team confirms the handover.`
                : rental.return_requested_at
                  ? 'Your scooter is waiting for staff confirmation. It stays yours until then.'
                  : `Hand your scooter in by ${describeReturnDeadline(rental.return_due_at)}. Our team will confirm the handover — the scooter stays yours until then.`}
          </Text>
        </View>
      ) : null}

      {hasPaymentGateStage && stage ? <ReturnStagePanel stage={stage} compact={compact} /> : null}
    </View>
  );
};

function ReturnStagePanel({ stage, compact }: { stage: ApiReturnStage; compact?: boolean }) {
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
          Return Status: {STAGE_HEADLINE[stage.status] ?? stage.status}
        </Text>
      </View>
      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
        {stage.status === 'payment_required'
          ? `An additional ₹${stage.additionalDue.toFixed(0)} was found during inspection (damage/other charges). Pay it above to continue your return.`
          : stage.status === 'payment_submitted'
            ? 'Payment Status: Paid – Awaiting Admin Verification. Your payment has been received. The admin will verify it and complete your vehicle return.'
            : stage.status === 'ready_for_approval'
              ? 'Your payment has been verified. Awaiting return completion — our team will finish processing the handover shortly.'
              : 'Your vehicle has been successfully returned.'}
      </Text>
    </View>
  );
}
