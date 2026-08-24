import React from 'react';
import { View, Text } from 'react-native';
import { Clock, AlertTriangle } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { computeLateReturnPenalty, describeReturnDeadline } from '../lib/returnPolicy';
import type { ApiRental } from '../types/api';

interface ReturnStatusCardProps {
  rental: ApiRental;
  /** Tighter padding for the Home card, where space is at a premium. */
  compact?: boolean;
}

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
 */
export const ReturnStatusCard: React.FC<ReturnStatusCardProps> = ({ rental, compact }) => {
  if (!rental.return_requested_at && !rental.recovery_flagged_at) return null;

  const charge = computeLateReturnPenalty({
    returnDueAt: rental.return_due_at,
    maxDays: rental.max_late_fee_days,
  });
  const recoveryRequired = !!rental.recovery_flagged_at;
  const overdue = charge.isLate;
  const tint = recoveryRequired || overdue ? COLORS.danger : COLORS.warning;
  const Icon = recoveryRequired || overdue ? AlertTriangle : Clock;

  return (
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
          // computeLateReturnPenalty caps daysLate at maxDays, so penaltyAmount
          // is already frozen at this point — no separate freeze logic needed.
          ? `A ₹${charge.penaltyAmount} late fee applies (capped at ${rental.max_late_fee_days} day${rental.max_late_fee_days > 1 ? 's' : ''}) and our team is on the way to collect the scooter. Please make it available for pickup.`
          : overdue
            ? `A ₹${charge.penaltyAmount} late fee has built up so far, and will be charged when our team confirms the handover.`
            : `Hand your scooter in by ${describeReturnDeadline(rental.return_due_at)}. Our team will confirm the handover — the scooter stays yours until then.`}
      </Text>
    </View>
  );
};
