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
import { DEPOSIT_STATUS_LABEL, DEPOSIT_STATUS_TONE } from '../constants/status';
import { useMyBilling } from '../hooks/useMyBilling';
import { useAuthStore } from '../store/useAuthStore';
import { billingRepository } from '../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../lib/razorpayCheckout';
import { getRenewalEligibility } from '../lib/returnPolicy';
import { ApiError } from '../lib/ApiError';
import type { ApiEarlyRecharge, ApiInvoice, InvoicePaymentStatus, PlanStatus } from '../types/api';

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

/** YYYY-MM-DD in local time, to compare against next_due_at (a date-only column) the same way the rider reads it on screen. */
function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayStr(): string {
  return dateStr(new Date());
}

export default function BillingScreen() {
  const { bookingId, booking, deposit, damages, invoices, loading, error, reload } = useMyBilling();
  const { refreshing, onRefresh } = useRefresh(() => reload(true));
  // Excludes disputed damages, mirroring refundableAmountForBooking on the
  // backend — a disputed deduction is on hold, not final, so it shouldn't
  // read as part of the settled breakdown yet.
  const settledDamages = damages.filter((d) => d.status !== 'disputed');
  const totalDeduction = settledDamages.reduce((sum, d) => sum + d.deposit_deduction, 0);
  const totalAdditionalDue = settledDamages.reduce((sum, d) => sum + d.outstanding_amount, 0);
  const profile = useAuthStore((s) => s.profile);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  // Two-step Recharge Now: tapping the teaser fetches the breakdown
  // (rechargePreview) without charging anything — only Confirm & Pay
  // actually opens the payment sheet. previewLoading covers step 1,
  // recharging covers step 2, so the button copy/spinner reflects whichever
  // is actually in flight.
  const [rechargePreview, setRechargePreview] = useState<ApiEarlyRecharge | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recharging, setRecharging] = useState(false);
  const [rechargeError, setRechargeError] = useState<string | null>(null);
  // Which Payment History row is expanded to show its line items — only
  // invoices minted by the Billing & Charges engine (transaction fee etc.)
  // have any; older/other invoices just show the flat amount as before.
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

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
  // A late fee may apply to a weekly-due 'rental' invoice — it's now a flat,
  // admin-configurable (and possibly per-booking-overridden) amount, not a
  // per-day multiplier the client can estimate. The server always recomputes
  // authoritatively when the order is created; the exact figure only shows
  // up once the rider actually starts paying (payInvoice/handleStartRecharge).
  const outstandingTotal = outstandingInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);
  const isDue = booking?.plan_status === 'due';
  const renewalStatus = booking?.renewal_status ?? null;
  const renewalEligibility = getRenewalEligibility(booking?.plan_status ?? null, booking?.next_due_at ?? null, renewalStatus);
  // Hidden once an outstanding invoice already exists (a prior recharge
  // attempt that was cancelled mid-payment) — Outstanding below covers that.
  const canRechargeEarly = renewalEligibility.canRenew && outstandingInvoices.length === 0;
  const planEndsToday = !!booking?.next_due_at && booking.next_due_at <= todayStr();

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
          name: 'SwapNgo',
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

  // Step 1: fetch (or idempotently re-fetch) the upcoming invoice and show
  // its breakdown. Generating the invoice never charges anything by itself —
  // only handleConfirmRecharge below does that.
  const handleStartRecharge = async () => {
    if (!bookingId) return;
    setRechargeError(null);
    setPreviewLoading(true);
    try {
      const recharge = await billingRepository.requestEarlyRecharge(bookingId);
      setRechargePreview(recharge);
    } catch (err) {
      if (err instanceof ApiError) setRechargeError(err.message);
      else setRechargeError('Could not load your recharge details. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCancelRechargePreview = () => {
    setRechargePreview(null);
    setRechargeError(null);
  };

  // Step 2: the rider has seen the breakdown and tapped Confirm — pay the
  // exact invoice previewed in step 1 (same idempotent invoice id, so
  // nothing can drift between review and payment).
  const handleConfirmRecharge = async () => {
    if (!rechargePreview) return;
    setRechargeError(null);
    setRecharging(true);
    try {
      const order = await billingRepository.createOrderForInvoice(rechargePreview.invoiceId);
      // No Razorpay keys configured on the backend yet — the order was
      // already settled server-side with temp data. Skip Checkout entirely.
      if (!order.mock) {
        const verifyPayload = await openRazorpayCheckout({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          order_id: order.gatewayOrderId,
          name: 'SwapNgo',
          description: 'Weekly Rental — Recharge',
          prefill: {
            email: profile?.email ?? undefined,
            contact: profile?.phone ?? undefined,
            name: profile?.full_name,
          },
          theme: { color: COLORS.primary },
        });
        await billingRepository.verifyPayment(verifyPayload);
      }
      setRechargePreview(null);
      reload();
    } catch (err) {
      if (err instanceof PaymentCancelledError || err instanceof PaymentUnavailableError) {
        setRechargeError(err.message);
      } else if (err instanceof ApiError) {
        setRechargeError(err.message);
      } else {
        setRechargeError('Recharge failed. Please try again.');
      }
    } finally {
      setRecharging(false);
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
            </Text>
            <Text className="text-white text-3xl font-black mb-4">
              ₹{(plan?.price ?? 0).toFixed(0)}{' '}
              {plan ? (
                <Text className="text-sm font-medium text-white/70">
                  / {CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                </Text>
              ) : null}
            </Text>
            <View
              className="flex-row items-center justify-between pt-3"
              style={{ borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
            >
              <View>
                <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Started</Text>
                <Text className="text-white text-xs font-bold mt-0.5">
                  {formatDate(booking?.current_period_start ?? null)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Ends</Text>
                <Text className="text-white text-xs font-bold mt-0.5">{formatDate(booking?.next_due_at ?? null)}</Text>
              </View>
            </View>
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
                  A late fee may apply. Renew now to keep riding and see the exact amount before you pay.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Renewal already paid and scheduled — the current plan stays
              active exactly as-is; nothing more to do until it activates. */}
          {renewalStatus === 'scheduled' ? (
            <View
              className="rounded-2xl p-4 mb-6 flex-row items-start"
              style={{ backgroundColor: COLORS.success + '14', borderWidth: 1, borderColor: COLORS.success + '55' }}
            >
              <Zap size={16} color={COLORS.success} style={{ marginTop: 1 }} />
              <View className="flex-1 ml-3">
                <Text style={{ color: COLORS.success }} className="text-xs font-extrabold">
                  Renewal scheduled — starts {formatDate(booking?.scheduled_start_date ?? null)}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-1 leading-relaxed">
                  Your current plan stays active until then — no action needed.
                </Text>
              </View>
            </View>
          ) : null}

          {/* Renew Plan — pay for the next period any time before or after
              it's due. Paid on time, the current plan stays active exactly as
              it is; the new period only starts once this one actually ends
              (see the scheduled-renewal state above). Paid late, a fee
              applies and the new period starts right away. */}
          {canRechargeEarly ? (
            <View
              className="rounded-2xl p-4 mb-6"
              style={{ backgroundColor: COLORS.primary + '0F', borderWidth: 1, borderColor: COLORS.primary + '40' }}
            >
              <View className="flex-row items-start mb-3">
                <Zap size={16} color={COLORS.primary} style={{ marginTop: 1 }} />
                <View className="flex-1 ml-3">
                  <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">
                    {renewalEligibility.isLate
                      ? 'Your plan has expired'
                      : planEndsToday ? 'Your plan ends today' : `Plan ends ${formatDate(booking?.next_due_at ?? null)}`}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-1 leading-relaxed">
                    {renewalEligibility.isLate
                      ? 'Renew now — a late fee applies, shown below before you pay.'
                      : 'Renew now to keep riding without interruption. Your next plan starts the moment this one ends.'}
                  </Text>
                </View>
              </View>
              {rechargePreview ? (
                <>
                  {/* Review — nothing has been charged yet. Confirm below actually pays. */}
                  <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: COLORS.card }}>
                    {rechargePreview.items.map((item, i) => (
                      <View key={i} className="flex-row items-center justify-between py-1">
                        <Text
                          style={{ color: item.itemType === 'discount' ? COLORS.success : COLORS.textPrimary }}
                          className="text-xs font-medium"
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={{ color: item.itemType === 'discount' ? COLORS.success : COLORS.textPrimary }}
                          className="text-xs font-semibold"
                        >
                          {item.itemType === 'discount' ? '-' : ''}₹{item.amount.toFixed(0)}
                        </Text>
                      </View>
                    ))}
                    <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-medium">Renewal amount</Text>
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">
                        ₹{rechargePreview.amountDue.toFixed(0)}
                      </Text>
                    </View>
                    {rechargePreview.isLate ? (
                      <View className="flex-row items-center justify-between mt-1">
                        <Text style={{ color: COLORS.danger }} className="text-xs font-medium">Late fee</Text>
                        <Text style={{ color: COLORS.danger }} className="text-xs font-semibold">
                          ₹{rechargePreview.lateFee.toFixed(0)}
                        </Text>
                      </View>
                    ) : null}
                    <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Total payable</Text>
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                        ₹{rechargePreview.total.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row" style={{ gap: 8 }}>
                    <TouchableOpacity
                      onPress={handleCancelRechargePreview}
                      disabled={recharging}
                      className="flex-1 py-3 rounded-xl items-center border"
                      style={{ borderColor: COLORS.border, opacity: recharging ? 0.6 : 1 }}
                    >
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleConfirmRecharge}
                      disabled={recharging}
                      className="flex-1 py-3 rounded-xl items-center flex-row justify-center"
                      style={{ backgroundColor: COLORS.primary, opacity: recharging ? 0.6 : 1 }}
                    >
                      {recharging ? <ActivityIndicator size="small" color="#FFF" /> : <CreditCard size={14} color="#FFF" />}
                      <Text className="text-white text-xs font-bold ml-2">
                        {recharging ? 'Processing…' : `Confirm & Pay ₹${rechargePreview.total.toFixed(0)}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  onPress={handleStartRecharge}
                  disabled={previewLoading}
                  className="py-3 rounded-xl items-center flex-row justify-center"
                  style={{ backgroundColor: COLORS.primary, opacity: previewLoading ? 0.6 : 1 }}
                >
                  {previewLoading ? <ActivityIndicator size="small" color="#FFF" /> : <CreditCard size={14} color="#FFF" />}
                  <Text className="text-white text-xs font-bold ml-2">
                    {previewLoading ? 'Loading…' : 'Review & Renew'}
                  </Text>
                </TouchableOpacity>
              )}
              {rechargeError ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">{rechargeError}</Text>
              ) : null}
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
                {outstandingInvoices.map((inv) => (
                  <View key={inv.id}>
                    {inv.payment_type === 'rental' ? (
                      <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mb-1.5">
                        A late fee may apply — shown when you tap Pay, before anything is charged.
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
                        Pay {PAYMENT_TYPE_LABEL[inv.payment_type ?? 'other']} — ₹{inv.amount_due.toFixed(0)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {payError ? (
                  <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">{payError}</Text>
                ) : null}
              </View>
            </>
          )}

          {/* Security deposit */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Security Deposit</Text>
          <View className="rounded-2xl border mb-6 overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <View className="p-4 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <ShieldCheck size={16} color={COLORS.primary} />
                <View className="ml-3">
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">₹{(deposit?.amount ?? 0).toFixed(0)}</Text>
                  {deposit?.status === 'refunded' && deposit.refunded_at ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      Refunded {formatDate(deposit.refunded_at)}
                    </Text>
                  ) : deposit?.status === 'partially_refunded' && deposit.refunded_at ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      Partially refunded {formatDate(deposit.refunded_at)}
                    </Text>
                  ) : deposit?.status === 'forfeited' ? (
                    <Text style={{ color: COLORS.danger }} className="text-[11px] font-medium mt-0.5">
                      Fully consumed by damage deductions
                    </Text>
                  ) : deposit?.status === 'held' && deposit.refund_eligible_at ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      Refund eligible from {formatDate(deposit.refund_eligible_at)}
                    </Text>
                  ) : null}
                </View>
              </View>
              {deposit ? <Badge label={DEPOSIT_STATUS_LABEL[deposit.status]} tone={DEPOSIT_STATUS_TONE[deposit.status]} /> : null}
            </View>

            {/* Settlement breakdown — only once there's something to explain (a damage deduction on file). */}
            {deposit && settledDamages.length > 0 && (
              <View className="px-4 pb-4 pt-1" style={{ borderTopWidth: 1, borderColor: COLORS.border }}>
                {settledDamages.map((d) => (
                  <View key={d.id} className="flex-row items-center justify-between py-1.5">
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium flex-1 mr-2">
                      {d.description}
                    </Text>
                    <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold">
                      -₹{d.deposit_deduction.toFixed(0)}
                    </Text>
                  </View>
                ))}
                <View className="h-px my-1.5" style={{ backgroundColor: COLORS.border }} />
                {totalAdditionalDue > 0 ? (
                  <View className="flex-row items-center justify-between py-1">
                    <Text style={{ color: COLORS.danger }} className="text-xs font-bold">Additional Amount Due</Text>
                    <Text style={{ color: COLORS.danger }} className="text-sm font-black">₹{totalAdditionalDue.toFixed(0)}</Text>
                  </View>
                ) : (
                  <View className="flex-row items-center justify-between py-1">
                    <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">Net Refund</Text>
                    <Text style={{ color: COLORS.primary }} className="text-sm font-black">
                      ₹{Math.max(0, (deposit.amount - totalDeduction)).toFixed(0)}
                    </Text>
                  </View>
                )}
              </View>
            )}
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
              {invoices.map((inv, i) => {
                const hasItems = inv.items.length > 0;
                const expanded = expandedInvoiceId === inv.id;
                return (
                  <View key={inv.id} style={i > 0 ? { borderTopWidth: 1, borderColor: COLORS.border } : undefined}>
                    <TouchableOpacity
                      className="p-4 flex-row items-center justify-between"
                      disabled={!hasItems}
                      onPress={() => setExpandedInvoiceId(expanded ? null : inv.id)}
                    >
                      <View>
                        <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">
                          {PAYMENT_TYPE_LABEL[inv.payment_type ?? 'other']}
                        </Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                          {formatDate(inv.paid_at ?? inv.due_date)}
                          {hasItems ? (expanded ? '  ▲' : '  ▼') : ''}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">₹{inv.amount_due.toFixed(0)}</Text>
                        <View className="mt-1">
                          <Badge label={inv.payment_status} tone={PAYMENT_STATUS_TONE[inv.payment_status]} />
                        </View>
                      </View>
                    </TouchableOpacity>
                    {expanded && hasItems ? (
                      <View className="px-4 pb-4">
                        {inv.items.map((item) => (
                          <View key={item.id} className="flex-row items-center justify-between py-1">
                            <Text style={{ color: item.item_type === 'discount' ? COLORS.success : COLORS.textSecondary }} className="text-[11px] font-medium">
                              {item.label}
                            </Text>
                            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                              {item.item_type === 'discount' ? '-' : ''}₹{item.amount.toFixed(0)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
