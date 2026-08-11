import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CreditCard, ShieldCheck, AlertTriangle, Receipt, Zap } from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Badge } from '../components/ui/Badge';
import { pullToRefresh, useRefresh } from '../components/ui/PullToRefresh';
import { COLORS } from '../constants/theme';
import { useMyBilling } from '../hooks/useMyBilling';
import { useAuthStore } from '../store/useAuthStore';
import { billingRepository } from '../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../lib/razorpayCheckout';
import { computeLatePaymentFee } from '../lib/latePaymentPolicy';
import { ApiError } from '../lib/ApiError';
import type { ApiInvoice, InvoicePaymentStatus, PlanStatus } from '../types/api';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

const PLAN_STATUS_TONE: Record<PlanStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success', due: 'warning', paused: 'warning',
};

const PAYMENT_STATUS_TONE: Record<InvoicePaymentStatus, 'success' | 'warning' | 'danger' | undefined> = {
  succeeded: 'success', pending: 'warning', processing: 'warning', failed: 'danger', refunded: undefined,
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  rental: 'Weekly Rental', deposit: 'Security Deposit', damage: 'Damage Charge',
  penalty: 'Penalty', refund: 'Refund', other: 'Payment',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BillingScreen() {
  const { bookingId, booking, deposit, damages, invoices, loading, error, reload } = useMyBilling();
  const { refreshing, onRefresh } = useRefresh(() => reload(true));
  const profile = useAuthStore((s) => s.profile);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  // The admin side can change this rider's plan_status (a payment going
  // overdue, a vehicle being released) with no action of the rider's own —
  // refetch whenever the screen regains focus, not just on first mount.
  //
  // Neither `[]` nor `[reload]` works here: useMyBilling returns a brand-new
  // `reload` closure every render, so
  //   - an empty-deps useCallback freezes that FIRST render's closure
  //     forever — before bookingId had even resolved — so later focus
  //     events call a stale reload() that resets billing back to empty.
  //   - depending on `[reload]` re-runs the effect on every render (not just
  //     focus/blur transitions), because useFocusEffect re-invokes whenever
  //     its callback identity changes — reload() -> state update -> re-render
  //     -> new reload -> effect fires again -> infinite loop.
  // A ref sidesteps both: the effect callback's identity stays stable
  // (empty deps, so it only fires on real focus events), while always
  // calling whatever the latest reload closure is.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useFocusEffect(
    useCallback(() => {
      reloadRef.current();
    }, []),
  );

  const plan = booking?.plan;
  const outstandingInvoices = invoices.filter((inv) => inv.payment_status === 'pending' || inv.payment_status === 'failed');
  // Late fee only accrues on a weekly-due 'rental' renewal — mirrors the
  // backend's createOrderForInvoice exactly (see latePaymentPolicy.ts); the
  // server always recomputes authoritatively when the order is created, this
  // is just what's shown before tapping Pay.
  const lateFeeFor = (inv: ApiInvoice) => (inv.payment_type === 'rental' ? computeLatePaymentFee(inv.due_date).lateFeeAmount : 0);
  const outstandingTotal = outstandingInvoices.reduce((sum, inv) => sum + inv.amount_due + lateFeeFor(inv), 0);
  const isDue = booking?.plan_status === 'due';

  const payInvoice = async (invoice: ApiInvoice) => {
    setPayError(null);
    setPayingInvoiceId(invoice.id);
    try {
      const order = await billingRepository.createOrderForInvoice(invoice.id);
      // No Razorpay keys configured on the backend yet — the order was
      // already settled server-side with temp data. Skip Checkout entirely.
      if (!order.mock) {
        const verifyPayload = await openRazorpayCheckout({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          order_id: order.gatewayOrderId,
          name: 'NR EV Scooters',
          description: PAYMENT_TYPE_LABEL[invoice.payment_type ?? 'other'],
          prefill: {
            email: profile?.email ?? undefined,
            contact: profile?.phone ?? undefined,
            name: profile?.full_name,
          },
          theme: { color: COLORS.primary },
        });
        await billingRepository.verifyPayment(verifyPayload);
      }
      reload();
    } catch (err) {
      if (err instanceof PaymentCancelledError || err instanceof PaymentUnavailableError) {
        setPayError(err.message);
      } else if (err instanceof ApiError) {
        setPayError(err.message);
      } else {
        setPayError('Payment failed. Please try again.');
      }
    } finally {
      setPayingInvoiceId(null);
    }
  };

  return (
    <AppShell title="Billing">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : !bookingId ? (
        <EmptyState
          icon={CreditCard}
          title="No active plan"
          subtitle="Book a scooter to see your billing details here."
        />
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-5"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={pullToRefresh(refreshing, onRefresh)}
        >
          {/* Current plan */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Current Plan</Text>
          <View className="rounded-3xl p-5 mb-6" style={{ backgroundColor: COLORS.primary }}>
            <View className="flex-row justify-between items-start mb-2">
              <Text className="text-white text-lg font-black">{plan?.name ?? 'Rental Plan'}</Text>
              {booking?.plan_status ? (
                <Badge label={booking.plan_status} tone={PLAN_STATUS_TONE[booking.plan_status]} />
              ) : null}
            </View>
            <Text className="text-white/80 text-xs font-medium mb-4">
              {plan ? `${CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle} rental` : ''}
              {booking?.next_due_at ? ` · Next due ${formatDate(booking.next_due_at)}` : ''}
            </Text>
            <Text className="text-white text-3xl font-black">
              ₹{(plan?.price ?? 0).toFixed(0)}{' '}
              {plan ? (
                <Text className="text-sm font-medium text-white/70">
                  / {CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                </Text>
              ) : null}
            </Text>
          </View>

          {/* Vehicle-lock warning — shown whenever the plan is overdue,
              regardless of whether an outstanding invoice happens to be
              loaded yet, since it's describing the consequence of plan_status
              itself, not any one invoice. */}
          {isDue ? (
            <View
              className="rounded-2xl p-4 mb-6 flex-row items-start"
              style={{ backgroundColor: COLORS.danger + '14', borderWidth: 1, borderColor: COLORS.danger + '55' }}
            >
              <Zap size={16} color={COLORS.danger} style={{ marginTop: 1 }} />
              <View className="flex-1 ml-3">
                <Text style={{ color: COLORS.danger }} className="text-xs font-extrabold">
                  Your scooter won't start until this is paid
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-1 leading-relaxed">
                  A ₹300/day late fee is added for every day the payment stays overdue. Pay now to keep riding and stop the fee from growing.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Outstanding payment */}
          {outstandingInvoices.length > 0 && (
            <>
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Outstanding</Text>
              <View className="rounded-2xl p-4 border mb-6" style={{ backgroundColor: COLORS.card, borderColor: COLORS.danger }}>
                <View className="flex-row items-center justify-between mb-3">
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">Amount due</Text>
                  <Text style={{ color: COLORS.danger }} className="text-lg font-black">₹{outstandingTotal.toFixed(0)}</Text>
                </View>
                {outstandingInvoices.map((inv) => {
                  const lateFee = lateFeeFor(inv);
                  const totalForInvoice = inv.amount_due + lateFee;
                  return (
                    <View key={inv.id}>
                      {lateFee > 0 ? (
                        <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mb-1.5">
                          Includes ₹{lateFee.toFixed(0)} late fee ({computeLatePaymentFee(inv.due_date).daysLate} day
                          {computeLatePaymentFee(inv.due_date).daysLate === 1 ? '' : 's'} overdue)
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => payInvoice(inv)}
                        disabled={payingInvoiceId === inv.id}
                        className="py-3 rounded-xl items-center flex-row justify-center mt-1"
                        style={{ backgroundColor: COLORS.primary, opacity: payingInvoiceId === inv.id ? 0.6 : 1 }}
                      >
                        {payingInvoiceId === inv.id ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <CreditCard size={14} color="#FFF" />
                        )}
                        <Text className="text-white text-xs font-bold ml-2">
                          Pay {PAYMENT_TYPE_LABEL[inv.payment_type ?? 'other']} — ₹{totalForInvoice.toFixed(0)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {payError ? (
                  <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">{payError}</Text>
                ) : null}
              </View>
            </>
          )}

          {/* Security deposit */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Security Deposit</Text>
          <View className="rounded-2xl p-4 border mb-6 flex-row items-center justify-between" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="flex-row items-center">
              <ShieldCheck size={16} color={COLORS.primary} />
              <View className="ml-3">
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">₹{(deposit?.amount ?? 0).toFixed(0)}</Text>
                {deposit?.status === 'refunded' && deposit.refunded_at ? (
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                    Refunded {formatDate(deposit.refunded_at)}
                  </Text>
                ) : deposit?.status === 'held' && deposit.refund_eligible_at ? (
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                    Refund eligible from {formatDate(deposit.refund_eligible_at)}
                  </Text>
                ) : null}
              </View>
            </View>
            {deposit ? <Badge label={deposit.status.replace('_', ' ')} tone={deposit.status === 'refunded' ? 'success' : 'neutral'} /> : null}
          </View>

          {/* Damage charges */}
          {damages.length > 0 && (
            <>
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Damage Charges</Text>
              <View className="rounded-2xl border mb-6 overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
                {damages.map((d, i) => (
                  <View
                    key={d.id}
                    className="p-4 flex-row items-start justify-between"
                    style={i > 0 ? { borderTopWidth: 1, borderColor: COLORS.border } : undefined}
                  >
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center">
                        <AlertTriangle size={14} color={COLORS.warning} />
                        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">{d.description}</Text>
                      </View>
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-1">
                        {formatDate(d.created_at)} · <Text className="capitalize">{d.status}</Text>
                      </Text>
                    </View>
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">₹{d.amount.toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Payment history */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Payment History</Text>
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No payments yet" />
          ) : (
            <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              {invoices.map((inv, i) => (
                <View
                  key={inv.id}
                  className="p-4 flex-row items-center justify-between"
                  style={i > 0 ? { borderTopWidth: 1, borderColor: COLORS.border } : undefined}
                >
                  <View>
                    <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">
                      {PAYMENT_TYPE_LABEL[inv.payment_type ?? 'other']}
                    </Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      {formatDate(inv.paid_at ?? inv.due_date)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">₹{inv.amount_due.toFixed(0)}</Text>
                    <View className="mt-1">
                      <Badge label={inv.payment_status} tone={PAYMENT_STATUS_TONE[inv.payment_status]} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
