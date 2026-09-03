import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  CheckCircle2, Clock, AlertTriangle, CreditCard, RefreshCw, Undo2,
} from 'lucide-react-native';
import { Spinner } from './Spinner';
import { COLORS } from '../constants/theme';
import { rentalRepository } from '../services';
import { usePaySettlement } from './SettlementCard';
import { computeLateReturnPenalty, effectiveDueAt, getRenewalEligibility } from '../lib/returnPolicy';
import type { ApiOverdueLateFee, ApiRental, ApiReturnSettlement, ApiReturnStage } from '../types/api';

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ScooterStatusCardProps {
  rental: ApiRental;
  settlement: ApiReturnSettlement | null;
  onSettlementPaid: () => void;
}

/**
 * The ONE thing Home shows about the rider's current scooter's status and
 * what to do about it — replaces what used to be up to three separate
 * stacked boxes (SettlementCard's due state, ReturnStatusCard's return/
 * payment-gate messaging, PlanStatusCard's renewal messaging). Same
 * underlying data and actions as before, just one card, one message, one
 * button, in priority order — a settlement actually due always outranks a
 * renewal reminder, since an open return blocks getting a new plan anyway.
 *
 * Renders ABOVE ActiveRentalCard, not below it: this is the alert strip, and
 * a warning a rider has to scroll past their own plan summary to reach is a
 * warning that arrives too late.
 *
 * It carries no Renew button of its own. "Renew Plan" is the primary action
 * on the My Plan card immediately below — one renew button on the screen,
 * in the place the plan itself lives. The only action here is paying a
 * return settlement, which nothing else on Home offers.
 */
export function ScooterStatusCard({
  rental, settlement, onSettlementPaid,
}: ScooterStatusCardProps) {
  const [stage, setStage] = useState<ApiReturnStage | null>(null);

  const loadStage = useCallback(() => {
    void rentalRepository.returnStage().then(setStage).catch(() => {
      // Non-critical: the card still renders from rental/settlement alone.
    });
  }, []);
  useEffect(loadStage, [loadStage]);
  const loadStageRef = useRef(loadStage);
  loadStageRef.current = loadStage;
  useFocusEffect(useCallback(() => { loadStageRef.current(); }, []));

  // The AUTHORITATIVE overdue figure — the same server preview the return
  // gate and the payable invoice are built from (GET /rentals/me/overdue-
  // late-fee -> previewOverdueLateFee). Home used to state the day count and
  // rupee amount from a device-clock estimate of the RETURN-lateness fee,
  // which is a different debt anchored to a different date; for a rider who
  // has not requested a return, what they actually owe is the RENEWAL late
  // fee, and that is what Billing bills them for. Two screens, two
  // estimates, two numbers for one debt.
  const [overdue, setOverdue] = useState<ApiOverdueLateFee | null>(null);
  const loadOverdue = useCallback(() => {
    void rentalRepository.overdueLateFee().then(setOverdue).catch(() => {
      // Non-critical: the local estimate below stands in.
    });
  }, []);
  useEffect(loadOverdue, [loadOverdue]);
  const loadOverdueRef = useRef(loadOverdue);
  loadOverdueRef.current = loadOverdue;
  useFocusEffect(useCallback(() => { loadOverdueRef.current(); }, []));

  const { pay, paying, payError } = usePaySettlement(
    settlement ?? { due_invoice_id: null } as ApiReturnSettlement,
    onSettlementPaid,
  );

  const isSettlementDue = !!settlement && settlement.due_amount > 0 && settlement.status === 'amount_due';
  // effectiveDueAt, not return_due_at alone — the documented way to resolve
  // the rider's real deadline (see lib/returnPolicy.ts), so a payload that
  // ever stops coalescing server-side can't silently zero the estimate out.
  const estimate = computeLateReturnPenalty({
    returnDueAt: effectiveDueAt(rental),
    maxDays: rental.max_late_fee_days,
    feePerDay: rental.late_return_fee_per_day,
  });
  // Server first, estimate only until it lands (or if the call failed).
  const daysLate = overdue?.isLate ? overdue.daysLate : estimate.daysLate;
  const lateAmount = overdue?.isLate ? overdue.lateFee : estimate.penaltyAmount;
  const recoveryRequired = !!rental.recovery_flagged_at;
  const overdueNow = overdue ? overdue.isLate : estimate.isLate;
  const eligibility = getRenewalEligibility(rental.plan_status, rental.next_due_at, rental.renewal_status);

  // --- Priority order: exactly one of these renders. -----------------------

  if (isSettlementDue) {
    return (
      <StatusShell tone="danger" icon={CreditCard} title="Payment Required">
        <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mt-1">
          ₹{settlement!.due_amount.toFixed(0)}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5 mb-3">
          Complete the payment to finish your scooter return.
        </Text>
        <ActionButton tone="danger" onPress={() => void pay()} busy={paying} label={`Pay ₹${settlement!.due_amount.toFixed(0)}`} />
        {payError ? (
          <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">{payError}</Text>
        ) : null}
      </StatusShell>
    );
  }

  if (stage?.status === 'payment_submitted') {
    return (
      <StatusShell tone="warning" icon={Clock} title="Payment Received">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          Awaiting admin confirmation before your return can be completed.
        </Text>
      </StatusShell>
    );
  }

  if (stage?.status === 'ready_for_approval') {
    return (
      <StatusShell tone="warning" icon={Clock} title="Return Verification Pending">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          Your payment is verified — our team is completing the handover.
        </Text>
      </StatusShell>
    );
  }

  // A return already requested supersedes lateness/renewal messaging — the
  // rider has already acted, so warning them to "return your scooter" or
  // "renew your plan" while their return is literally in flight is stale
  // noise, not a call to action. This must outrank recoveryRequired/overdue/
  // eligibility below, even though those are computed from the same
  // return_due_at/expiry fields and would otherwise still read as true.
  if (rental.return_requested_at) {
    return (
      <StatusShell tone="warning" icon={Undo2} title="Return Requested">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          Your scooter is waiting for staff confirmation. It stays yours until then.
        </Text>
      </StatusShell>
    );
  }

  if (recoveryRequired) {
    return (
      <StatusShell tone="danger" icon={AlertTriangle} title="Vehicle Recovery Required">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          A ₹{lateAmount.toFixed(0)} late fee applies. Please make your scooter available for pickup.
        </Text>
      </StatusShell>
    );
  }

  // ABOVE the overdue branch, not below it. A renewal that has been PAID and
  // is waiting to activate leaves the outgoing period `current` and its
  // due_on in the past, so the lateness maths still reads "overdue" — and a
  // rider who has already paid was being told, in red, that a late fee was
  // building up against them.
  if (rental.renewal_status === 'scheduled') {
    return (
      <StatusShell tone="success" icon={RefreshCw} title="Renewal Scheduled">
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          {rental.scheduled_start_date ? `Starts ${formatDay(rental.scheduled_start_date)}. ` : ''}
          Your current plan stays active until then.
        </Text>
      </StatusShell>
    );
  }

  // One state, not two. "Plan expired" and "overdue by N days" were separate
  // branches with overdue winning, so an expired rider got the lateness
  // warning ("return your scooter as soon as possible") and never the thing
  // they actually needed to do — renew. Renewing is what clears this fee.
  if (overdueNow) {
    return (
      <StatusShell
        tone="danger"
        icon={AlertTriangle}
        title={`Plan expired · overdue by ${daysLate} day${daysLate === 1 ? '' : 's'}`}
      >
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          {lateAmount > 0 ? `A ₹${lateAmount.toFixed(0)} late fee has built up and grows each day. ` : ''}
          {eligibility.canRenew
            ? 'Renew your plan below to clear it and keep riding.'
            : 'Return your scooter as soon as possible.'}
        </Text>
      </StatusShell>
    );
  }

  // Reached only when the SERVER says nothing is overdue yet. eligibility is
  // computed off the device clock, so the two can briefly disagree for a
  // handset set to another timezone — keep the late wording available here so
  // that rider still gets an accurate card rather than a cheerful one.
  if (eligibility.canRenew) {
    const remaining = rental.next_due_at ? describeDaysLeft(rental.next_due_at) : null;
    return (
      <StatusShell
        tone={eligibility.isLate ? 'danger' : 'primary'}
        icon={RefreshCw}
        title={
          eligibility.isLate
            ? 'Plan Expired'
            : rental.next_due_at
              ? `Plan ends ${formatDay(rental.next_due_at)}${remaining ? ` · ${remaining}` : ''}`
              : 'Plan Status'
        }
      >
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
          {eligibility.isLate
            ? 'Renew below — a late fee applies, shown before you pay.'
            : 'Renew any time before your plan ends.'}
        </Text>
      </StatusShell>
    );
  }

  return (
    <StatusShell tone="success" icon={CheckCircle2} title="Scooter Active">
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">Everything looks good.</Text>
    </StatusShell>
  );
}

function describeDaysLeft(nextDueAt: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${nextDueAt}T00:00:00`);
  const remaining = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (remaining <= 0) return null;
  return `${remaining} day${remaining === 1 ? '' : 's'} left`;
}

const TONE_COLOR: Record<'danger' | 'warning' | 'success' | 'primary', string> = {
  danger: COLORS.danger, warning: COLORS.warning, success: COLORS.success, primary: COLORS.primary,
};

function StatusShell({
  tone, icon: Icon, title, children,
}: {
  tone: 'danger' | 'warning' | 'success' | 'primary';
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  const tint = TONE_COLOR[tone];
  return (
    <View
      className="rounded-2xl p-4 mb-5"
      style={{
        backgroundColor: tint + '0A', borderWidth: 1, borderColor: tint + '26',
        shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1,
      }}
    >
      <View className="flex-row items-center mb-1.5">
        <Icon size={16} color={tint} />
        <Text style={{ color: tint }} className="text-xs font-bold ml-2 flex-1">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ActionButton({
  tone, onPress, busy, label,
}: {
  tone: 'danger' | 'warning' | 'success' | 'primary' | 'outline';
  onPress: () => void;
  busy?: boolean;
  label: string;
}) {
  const outline = tone === 'outline';
  const tint = outline ? undefined : TONE_COLOR[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      className="py-3 rounded-xl items-center flex-row justify-center"
      style={outline
        ? { borderWidth: 1, borderColor: COLORS.border, opacity: busy ? 0.6 : 1 }
        : { backgroundColor: tint, opacity: busy ? 0.6 : 1 }}
    >
      {busy ? (
        <Spinner size={14} color={outline ? COLORS.textPrimary : '#FFF'} />
      ) : (
        <CreditCard size={14} color={outline ? COLORS.textPrimary : '#FFF'} />
      )}
      <Text style={{ color: outline ? COLORS.textPrimary : '#FFF' }} className="text-xs font-bold ml-2">{label}</Text>
    </TouchableOpacity>
  );
}
