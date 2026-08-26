import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useFocusEffect } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, ShieldCheck, Receipt } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Badge } from '../../components/ui/Badge';
import { pullToRefresh, useRefresh } from '../../components/ui/PullToRefresh';
import { COLORS } from '../../constants/theme';
import { DEPOSIT_STATUS_LABEL, DEPOSIT_STATUS_TONE } from '../../constants/status';
import { useMyBilling } from '../../hooks/useMyBilling';
import { useAuthStore } from '../../store/useAuthStore';
import { billingRepository, rentalRepository } from '../../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../../lib/razorpayCheckout';
import { getRenewalEligibility } from '../../lib/returnPolicy';
import { ApiError } from '../../lib/ApiError';
import type {
  ApiEarlyRecharge, ApiInvoice, ApiPaymentOrder, ApiPlanQuote, ApiReturnSettlement, ApiReturnStage,
  InvoicePaymentState,
} from '../../types/api';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

// "Payment attention required," not "system error" — overdue is still just
// due, not a failed charge, so it reads as amber (attention) rather than the
// bright red a genuine gateway failure would deserve. There is no "failed"
// state in this data model at all today.
const PAYMENT_STATE_TONE: Record<InvoicePaymentState, 'success' | 'warning' | 'danger' | undefined> = {
  paid: 'success', partial: 'warning', overdue: 'warning', unpaid: undefined,
};
const PAYMENT_STATE_LABEL: Record<InvoicePaymentState, string> = {
  paid: 'Paid', partial: 'Partially Paid', overdue: 'Due', unpaid: 'Due',
};

/**
 * An invoice is raised for a REASON now, not for a payment kind. The old
 * rental/deposit/damage/penalty split was `payment_type`, which is gone —
 * a deposit is a LINE on the initial invoice, and a damage charge is a line
 * on the settlement one.
 */
const PURPOSE_LABEL: Record<string, string> = {
  initial: 'Plan & Deposit', subscription_period: 'Plan Renewal',
  settlement: 'Return Settlement', adhoc: 'Payment',
};

/**
 * What to call one invoice.
 *
 * `purpose` alone gets the FIRST one wrong. chk_invoices_purpose_period
 * forces every period invoice — the opening one included — to be
 * 'subscription_period', so the rider's very first payment, the one that
 * carried the deposit and the welcome discount, showed up in Payment History
 * as "Plan Renewal" before they had ever renewed anything.
 *
 * The deposit line is what distinguishes it: the deposit is billed once,
 * alongside period 1, and never again.
 */
function invoiceLabel(invoice: ApiInvoice): string {
  if (
    invoice.purpose === 'subscription_period'
    && invoice.items.some((item) => item.item_type === 'deposit')
  ) {
    return PURPOSE_LABEL.initial;
  }
  return PURPOSE_LABEL[invoice.purpose] ?? 'Payment';
}

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

/** 0–100, how far today sits between the period's start and its due date. */
function periodProgress(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

/** One line item on a bill card — label left, amount right. `attention` (a
 * late fee) reads amber, never bright red — it's a charge to notice, not a
 * system failure. */
function BillLine({ label, amount, attention }: { label: string; amount: number; attention?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text style={{ color: attention ? COLORS.warning : COLORS.textSecondary }} className="text-[13px] font-medium flex-1 pr-3">
        {label}
      </Text>
      <Text style={{ color: attention ? COLORS.warning : COLORS.textPrimary }} className="text-[13px] font-semibold">
        ₹{amount.toFixed(0)}
      </Text>
    </View>
  );
}

/** Small amber "needs attention" indicator — replaces a red warning sentence. */
function AttentionNote({ label }: { label: string }) {
  return (
    <View className="flex-row items-center mb-3">
      <View className="w-1.5 h-1.5 rounded-full mr-2" style={{ backgroundColor: COLORS.warning }} />
      <Text style={{ color: COLORS.warning }} className="text-[11px] font-bold uppercase tracking-wide">{label}</Text>
    </View>
  );
}

export default function BillingScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { bookingId, booking, deposit, damages, invoices, loading, error, reload } = useMyBilling();
  const { refreshing, onRefresh } = useRefresh(() => reload(true));
  // Excludes disputed damages, mirroring refundableAmountForBooking on the
  // backend — a disputed deduction is on hold, not final, so it shouldn't
  // read as part of the settled breakdown yet.
  const settledDamages = damages.filter((d) => d.status !== 'disputed');
  const totalDeduction = settledDamages.reduce((sum, d) => sum + d.deposit_deduction, 0);
  const totalAdditionalDue = settledDamages.reduce((sum, d) => sum + d.outstanding_amount, 0);
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [completingBookingPayment, setCompletingBookingPayment] = useState(false);
  const [bookingPaymentError, setBookingPaymentError] = useState<string | null>(null);
  // The real bill (deposit + transaction fee + any welcome discount) —
  // plan.price alone is only the rental line, same reasoning as
  // booking/billing.tsx's own quote. Either the pre-checkout quote or the
  // created order carry the same { lines, amount } shape; the order (once
  // created) wins, since it's what Razorpay will actually charge.
  const [bookingQuote, setBookingQuote] = useState<ApiPaymentOrder | ApiPlanQuote | null>(null);
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

  // has_active_rental/has_active_booking (which useMyBilling's own
  // useCurrentRideOrBooking gates on) only ever update from the rider's own
  // mutations elsewhere in the store — a return admin just completed
  // wouldn't otherwise be reflected here until something unrelated
  // refreshed the profile. Same fix as Home/My Scooter.
  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
    }, [refreshProfile]),
  );

  // Return status must always outrank a stale expired-plan reading: a
  // rental's plan can independently be past_due for renewal purposes while
  // its vehicle is mid-return, and once the return is genuinely resolved the
  // subscription itself may still be "past_due" for a few moments until
  // admin's Complete Return finalizes it (subscriptions.status -> 'ended').
  // Neither of those should ever surface Renew/Review/Plan-Expired copy for
  // a rental that's actively being handed back.
  const [returnStage, setReturnStage] = useState<ApiReturnStage | null>(null);
  const loadReturnStage = useCallback(() => {
    void rentalRepository.returnStage().then(setReturnStage).catch(() => {
      // Non-critical: the rest of Billing renders fine without it.
    });
  }, []);
  useEffect(loadReturnStage, [loadReturnStage]);
  const loadReturnStageRef = useRef(loadReturnStage);
  loadReturnStageRef.current = loadReturnStage;
  useFocusEffect(useCallback(() => { loadReturnStageRef.current(); }, []));
  const hasActiveReturn = !!returnStage
    && returnStage.status !== 'return_completed' && returnStage.status !== 'rejected';

  // Once there's no active booking/rental left, Billing would otherwise show
  // a bare "No active plan" empty state even for a rider who JUST completed
  // a return — the most recent settlement (paid, refunded, or fully
  // adjusted) is the closed historical record for that rental instead of
  // nothing at all.
  const [pastSettlement, setPastSettlement] = useState<ApiReturnSettlement | null>(null);
  useEffect(() => {
    if (bookingId) { setPastSettlement(null); return; }
    void rentalRepository.settlement().then((s) => {
      setPastSettlement(s && s.status !== 'amount_due' ? s : null);
    }).catch(() => {
      // Non-critical.
    });
  }, [bookingId]);

  const plan = booking?.plan;
  const isPendingBookingPayment = booking?.status === 'pending_payment';

  // Read-only: fetches the itemized breakdown (deposit, transaction fee,
  // any welcome discount) for a booking whose first payment never went
  // through, so the card below can show the REAL total rather than just
  // the rental price — mirrors booking/billing.tsx's own quotePlan() call.
  useEffect(() => {
    if (!isPendingBookingPayment || !plan?.id || bookingQuote) return;
    let cancelled = false;
    billingRepository
      .quotePlan(plan.id, booking?.start_day ?? undefined)
      .then((q) => { if (!cancelled) setBookingQuote(q); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isPendingBookingPayment, plan?.id, booking?.start_day, bookingQuote]);

  // Anything not fully covered by allocations, voided invoices excluded.
  // `partial` counts: half-paid is still owed.
  const outstandingInvoices = invoices.filter(
    (inv) => inv.status !== 'void' && inv.payment_state !== 'paid',
  );
  // GET /invoices/me already attaches the live-computed late fee (days late ×
  // the admin-configured per-day rate) to any late PERIOD invoice — see
  // total_due on ApiInvoice. Falls back to the outstanding BALANCE for
  // anything else, not the whole bill: a part-paid invoice must not ask for
  // the full amount again.
  const outstandingTotal = outstandingInvoices.reduce(
    (sum, inv) => sum + (inv.total_due ?? inv.balance_amount), 0,
  );
  // A return in progress always outranks "past_due"/"expired" — see
  // hasActiveReturn above.
  const isDue = booking?.plan_status === 'past_due' && !hasActiveReturn;
  const renewalStatus = booking?.renewal_status ?? null;
  const renewalEligibility = getRenewalEligibility(booking?.plan_status ?? null, booking?.next_due_at ?? null, renewalStatus);
  // Hidden once an outstanding invoice already exists (a prior recharge
  // attempt that was cancelled mid-payment) — Outstanding below covers that
  // — and hidden entirely while a return is in progress: renewing (or
  // reading the old plan as "expired") makes no sense for a scooter that's
  // actively being handed back.
  const canRechargeEarly = renewalEligibility.canRenew && outstandingInvoices.length === 0 && !hasActiveReturn;
  const planEndsToday = !!booking?.next_due_at && booking.next_due_at <= todayStr();
  // Late renewals read RED here exactly as they do on the home card — a rider
  // who taps a red "Renew Plan" must not land on a green bill and lose the
  // signal that a late fee is in it. The server's verdict wins once the
  // preview is loaded; before that, the local estimate stands in. Suppressed
  // during an active return for the same reason as canRechargeEarly above.
  const renewalIsLate = !hasActiveReturn && (rechargePreview?.isLate ?? renewalEligibility.isLate);

  const payInvoice = async (invoice: ApiInvoice) => {
    setPayError(null);
    setPayingInvoiceId(invoice.id);
    try {
      const order = await billingRepository.createOrderForInvoice(invoice.id);
      // Checkout is the only way a payment happens. The backend can no
      // longer reply `mock: true` to say it settled the order itself.
      const verifyPayload = await openRazorpayCheckout({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.gatewayOrderId,
        description: invoiceLabel(invoice),
        prefill: {
          email: profile?.email ?? undefined,
          contact: profile?.phone ?? undefined,
          name: profile?.full_name,
        },
        theme: { color: COLORS.primary },
      });
      await billingRepository.verifyPayment(verifyPayload);
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

  // Resumes a booking whose FIRST payment never went through — e.g. the
  // rider backed out of Razorpay, lost connectivity, or killed the app
  // before checkout finished. That booking has no subscription/invoice yet
  // (createOrderForBooking creates both), so the Outstanding section above
  // has nothing to show; this is the only way to get back into checkout
  // after leaving the booking-creation screen (Home's "Complete Payment"
  // card links here with no params, expecting this screen to handle it).
  const handleCompleteBookingPayment = async () => {
    if (!bookingId) return;
    setBookingPaymentError(null);
    setCompletingBookingPayment(true);
    try {
      const order = await billingRepository.createOrderForBooking(bookingId);
      // The real, authoritative lines — same reasoning as booking/billing.tsx:
      // if the rider cancels Checkout and lands back here, the breakdown
      // redraws with the server's actual rows instead of the plan-only quote.
      setBookingQuote(order);
      const verifyPayload = await openRazorpayCheckout({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.gatewayOrderId,
        description: plan?.name ?? 'Scooter Booking',
        prefill: {
          email: profile?.email ?? undefined,
          contact: profile?.phone ?? undefined,
          name: profile?.full_name,
        },
        theme: { color: COLORS.primary },
      });
      await billingRepository.verifyPayment(verifyPayload);
      reload();
    } catch (err) {
      if (err instanceof PaymentCancelledError || err instanceof PaymentUnavailableError) {
        setBookingPaymentError(err.message);
      } else if (err instanceof ApiError) {
        setBookingPaymentError(err.message);
      } else {
        setBookingPaymentError('Payment failed. Please try again.');
      }
    } finally {
      setCompletingBookingPayment(false);
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
      const verifyPayload = await openRazorpayCheckout({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        order_id: order.gatewayOrderId,
        description: 'Weekly Rental — Recharge',
        prefill: {
          email: profile?.email ?? undefined,
          contact: profile?.phone ?? undefined,
          name: profile?.full_name,
        },
        theme: { color: COLORS.primary },
      });
      await billingRepository.verifyPayment(verifyPayload);
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
          <Spinner size={32} color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : !bookingId && pastSettlement ? (
        // No active booking/rental left — but the most recent settlement is
        // a closed historical record, not nothing. A rider who just finished
        // a return should see what happened, not a generic "No active plan."
        <ScrollView
          className="flex-1 px-5 pt-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + tabBarHeight + 24 }}
          refreshControl={pullToRefresh(refreshing, onRefresh)}
        >
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-3">Rental Returned</Text>
          <View
            className="rounded-2xl border p-5 mb-6"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.success + '1A' }}>
                  <ShieldCheck size={16} color={COLORS.success} />
                </View>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold ml-3">
                  {pastSettlement.processed_at ? formatDate(pastSettlement.processed_at) : 'Return complete'}
                </Text>
              </View>
              <Badge label="Completed" tone="success" />
            </View>

            <BillLine label="Security Deposit" amount={pastSettlement.deposit_amount} />
            {pastSettlement.late_fee_amount > 0 ? <BillLine label="Late Fee" amount={-pastSettlement.late_fee_amount} /> : null}
            {pastSettlement.damage_fee_amount > 0 ? <BillLine label="Damage Charges" amount={-pastSettlement.damage_fee_amount} /> : null}
            {pastSettlement.other_charges.map((c, i) => (
              <BillLine key={i} label={c.label} amount={-c.amount} />
            ))}
            {/* Charges exceeded the deposit and the rider paid the
                difference — without this, that payment has no line of its
                own and the deposit + damage figures above don't add up to
                the total below. */}
            {pastSettlement.paid_by_rider_amount > 0 ? (
              <BillLine label="Paid by You" amount={pastSettlement.paid_by_rider_amount} />
            ) : null}
            <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />

            <View className="flex-row items-center justify-between mb-3">
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">
                {pastSettlement.refund_amount > 0 ? 'Refund Amount' : pastSettlement.due_amount > 0 ? 'Additional Payment' : 'Total Charges'}
              </Text>
              <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-bold">
                ₹{(pastSettlement.refund_amount > 0 ? pastSettlement.refund_amount
                  : pastSettlement.due_amount > 0 ? pastSettlement.due_amount
                    : pastSettlement.total_charges).toFixed(0)}
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">Payment Status</Text>
              <Badge
                label={pastSettlement.status === 'pending_refund' || pastSettlement.status === 'refund_processing'
                  ? 'Refund Pending' : 'Paid'}
                tone={pastSettlement.status === 'pending_refund' || pastSettlement.status === 'refund_processing'
                  ? 'warning' : 'success'}
              />
            </View>
          </View>
        </ScrollView>
      ) : !bookingId ? (
        <EmptyState
          icon={CreditCard}
          title="No active plan"
          subtitle="Book a scooter to see your billing details here."
        />
      ) : (
        <ScrollView
          className="flex-1 px-5 pt-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + tabBarHeight + 24 }}
          refreshControl={pullToRefresh(refreshing, onRefresh)}
        >
          {/* Current plan — a quiet, sophisticated surface rather than a
              solid brand-color block: the price is the loud element, not
              the card itself. */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-3">Current Plan</Text>
          <View
            className="rounded-3xl p-5 mb-7 border"
            style={{
              backgroundColor: COLORS.primary + '0A',
              borderColor: COLORS.primary + '26',
              shadowColor: COLORS.black,
              shadowOpacity: 0.04,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 4 },
              elevation: 1,
            }}
          >
            {booking?.plan_status ? (
              <View className="self-start px-2.5 py-1 rounded-full mb-3" style={{ backgroundColor: COLORS.primary + '1A' }}>
                <Text style={{ color: COLORS.primaryPressed }} className="text-[10px] font-bold uppercase tracking-wider">
                  {booking.plan_status.replace('_', ' ')}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">{plan?.name ?? 'Rental Plan'}</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5 mb-4">
              {plan ? `${CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle} rental` : ''}
            </Text>
            <Text style={{ color: COLORS.textPrimary }} className="text-4xl font-bold mb-4">
              ₹{(plan?.price ?? 0).toFixed(0)}{' '}
              {plan ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium">
                  / {CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                </Text>
              ) : null}
            </Text>

            {/* Period progress — how far through the current rental period. */}
            {booking?.current_period_start && booking?.next_due_at ? (
              <View className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ backgroundColor: COLORS.primary + '14' }}>
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${periodProgress(booking.current_period_start, booking.next_due_at)}%`,
                    backgroundColor: COLORS.primary,
                  }}
                />
              </View>
            ) : null}

            <View
              className="flex-row items-center justify-between pt-3"
              style={{ borderTopWidth: 1, borderColor: COLORS.primary + '1F' }}
            >
              <View>
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">
                  {formatDate(booking?.current_period_start ?? null)}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mt-0.5">Started</Text>
              </View>
              <View className="items-end">
                <Text style={{ color: renewalIsLate ? COLORS.warning : COLORS.textPrimary }} className="text-xs font-bold">
                  {formatDate(booking?.next_due_at ?? null)}{renewalIsLate ? ' · expired' : ''}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mt-0.5">Ends</Text>
              </View>
            </View>
          </View>

          {/* Amount Due — exactly one of these five states, never stacked.
              Same handlers/data as before; just one consistent section
              instead of up to four separate colored boxes. */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-3">Amount Due</Text>

          {isPendingBookingPayment ? (
            // Booking payment never completed — no subscription/invoice
            // exists yet, so there's nothing in "invoices" to show. This is
            // the only way back into checkout after leaving the
            // booking-creation screen.
            <View
              className="rounded-2xl border mb-7 overflow-hidden"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
            >
              <View className="p-5">
                <AttentionNote label="Payment required" />
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-1">Booking Payment</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-4 leading-relaxed">
                  Your last payment attempt didn't go through. Your reservation is still held — complete the
                  payment to confirm your booking.
                </Text>

                {bookingQuote ? (
                  // The real bill — deposit and transaction fee included,
                  // not just the rental line. Every row comes from
                  // invoice_items, so what's shown here is exactly what
                  // Razorpay charges.
                  bookingQuote.lines.map((line, i) => (
                    <View key={i} className="flex-row items-center justify-between mb-2">
                      <Text
                        style={{ color: line.amount < 0 ? COLORS.success : COLORS.textSecondary }}
                        className="text-xs font-medium flex-1 pr-3"
                      >
                        {line.description}
                      </Text>
                      <Text
                        style={{ color: line.amount < 0 ? COLORS.success : COLORS.textPrimary }}
                        className="text-xs font-semibold"
                      >
                        {line.amount < 0 ? '-' : ''}₹{Math.abs(line.amount).toFixed(0)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <>
                    <BillLine label="Rental plan amount" amount={plan?.price ?? 0} />
                    <BillLine label="Security deposit" amount={plan?.deposit_amount ?? 0} />
                  </>
                )}
                <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                <View className="flex-row items-center justify-between mb-4">
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">Total</Text>
                  <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-bold">
                    ₹{(bookingQuote?.amount ?? (plan?.price ?? 0) + (plan?.deposit_amount ?? 0)).toFixed(0)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => void handleCompleteBookingPayment()}
                  disabled={completingBookingPayment}
                  className="py-3.5 rounded-2xl items-center flex-row justify-center"
                  style={{ backgroundColor: COLORS.primary, opacity: completingBookingPayment ? 0.6 : 1 }}
                >
                  {completingBookingPayment ? (
                    <Spinner size={16} color="#FFF" />
                  ) : (
                    <CreditCard size={16} color="#FFF" />
                  )}
                  <Text className="text-white text-sm font-bold ml-2">
                    {completingBookingPayment
                      ? 'Processing…'
                      : `Pay ₹${(bookingQuote?.amount ?? (plan?.price ?? 0) + (plan?.deposit_amount ?? 0)).toFixed(0)}`}
                  </Text>
                </TouchableOpacity>
                {bookingPaymentError ? (
                  <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">
                    {bookingPaymentError}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : outstandingInvoices.length > 0 ? (
            <>
              <AttentionNote label="Payment required" />
              {/* Consequence of plan_status='past_due' — a quiet note, not a
                  red banner: attention, not alarm. */}
              {isDue ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-3 -mt-2">
                  Your scooter won't start until this is paid.
                </Text>
              ) : null}
              {outstandingInvoices.length > 1 ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mb-2">
                  ₹{outstandingTotal.toFixed(0)} total across {outstandingInvoices.length} invoices
                </Text>
              ) : null}

              {outstandingInvoices.map((inv) => {
                const perDay = inv.late_fee && inv.days_late ? inv.late_fee / inv.days_late : 0;
                const total = inv.total_due ?? inv.balance_amount;
                return (
                  <View
                    key={inv.id}
                    className="rounded-2xl border mb-4 overflow-hidden"
                    style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
                  >
                    <View className="p-5">
                      <View className="flex-row items-center justify-between mb-3">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">
                          {invoiceLabel(inv)}
                        </Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                          Due {formatDate(inv.due_on)}
                        </Text>
                      </View>

                      <BillLine label="Rental plan amount" amount={inv.total_amount} />
                      {inv.allocated_amount > 0 ? (
                        <BillLine label="Already paid" amount={-inv.allocated_amount} />
                      ) : null}
                      {inv.late_fee ? (
                        <BillLine
                          label={`Late fee (${inv.days_late} day${inv.days_late === 1 ? '' : 's'} × ₹${perDay.toFixed(0)}/day)`}
                          amount={inv.late_fee}
                          attention
                        />
                      ) : null}
                      <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                      <View className="flex-row items-center justify-between pb-1">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">Total</Text>
                        <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-bold">₹{total.toFixed(0)}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      onPress={() => payInvoice(inv)}
                      disabled={payingInvoiceId === inv.id}
                      className="mx-5 mb-5 py-3.5 rounded-2xl items-center flex-row justify-center"
                      style={{ backgroundColor: COLORS.primary, opacity: payingInvoiceId === inv.id ? 0.6 : 1 }}
                    >
                      {payingInvoiceId === inv.id ? (
                        <Spinner size={16} color="#FFF" />
                      ) : (
                        <CreditCard size={16} color="#FFF" />
                      )}
                      <Text className="text-white text-sm font-bold ml-2">
                        {payingInvoiceId === inv.id ? 'Processing…' : `Pay ₹${total.toFixed(0)}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {payError ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mb-3">{payError}</Text>
              ) : null}
            </>
          ) : hasActiveReturn ? (
            // A return is mid-flight for this rental — Renew/Review/Plan
            // Expired never make sense here (see hasActiveReturn above), so
            // this replaces them rather than sitting alongside them.
            <View
              className="rounded-2xl border p-4 mb-7 flex-row items-center"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
            >
              <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.warning + '1A' }}>
                <ShieldCheck size={16} color={COLORS.warning} />
              </View>
              <View className="flex-1 ml-3">
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">Return in Progress</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                  {returnStage?.status === 'payment_submitted'
                    ? 'Your payment was received — awaiting admin confirmation.'
                    : returnStage?.status === 'ready_for_approval'
                      ? 'Payment verified — our team is completing your return.'
                      : 'Your return is awaiting staff review.'}
                </Text>
              </View>
            </View>
          ) : canRechargeEarly ? (
            // Renew Plan — only offered from the plan's last day onward
            // (getRenewalEligibility), not before. Paid on time, the current
            // plan stays active exactly as it is; the new period only
            // starts once this one actually ends. Paid late, a fee applies
            // and the new period starts right away.
            <View
              className="rounded-2xl border p-5 mb-7"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
            >
              {renewalIsLate ? <AttentionNote label="Payment required" /> : null}
              <Text style={{ color: renewalIsLate ? COLORS.warning : COLORS.textPrimary }} className="text-sm font-semibold mb-1">
                {renewalIsLate
                  ? 'Your plan has expired'
                  : planEndsToday ? 'Your plan ends today' : `Plan ends ${formatDate(booking?.next_due_at ?? null)}`}
              </Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-4 leading-relaxed">
                {renewalIsLate
                  ? 'Renew now — a late fee applies, shown below before you pay.'
                  : 'Renew now to keep riding without interruption. Your next plan starts the moment this one ends.'}
              </Text>
              {rechargePreview ? (
                <>
                  {/* Review — nothing has been charged yet. Confirm below actually pays. */}
                  <View className="rounded-xl p-3.5 mb-3" style={{ backgroundColor: COLORS.background }}>
                    {rechargePreview.items.map((item, i) => (
                      <View key={i} className="flex-row items-center justify-between py-1">
                        {/* A discount is an `adjustment` with a NEGATIVE amount, not its own line type — read the sign, not the type. */}
                        <Text
                          style={{ color: item.amount < 0 ? COLORS.success : COLORS.textPrimary }}
                          className="text-xs font-medium"
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={{ color: item.amount < 0 ? COLORS.success : COLORS.textPrimary }}
                          className="text-xs font-semibold"
                        >
                          {item.amount < 0 ? '-' : ''}₹{Math.abs(item.amount).toFixed(0)}
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
                        <Text style={{ color: COLORS.warning }} className="text-xs font-medium">
                          Late fee ({rechargePreview.daysLate} day{rechargePreview.daysLate === 1 ? '' : 's'} × ₹{rechargePreview.feePerDay.toFixed(0)})
                        </Text>
                        <Text style={{ color: COLORS.warning }} className="text-xs font-semibold">
                          ₹{rechargePreview.lateFee.toFixed(0)}
                        </Text>
                      </View>
                    ) : null}
                    <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                    <View className="flex-row items-center justify-between">
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">Total payable</Text>
                      <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">
                        ₹{rechargePreview.total.toFixed(0)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row" style={{ gap: 8 }}>
                    <TouchableOpacity
                      onPress={handleCancelRechargePreview}
                      disabled={recharging}
                      className="flex-1 py-3.5 rounded-2xl items-center border"
                      style={{ borderColor: COLORS.border, opacity: recharging ? 0.6 : 1 }}
                    >
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleConfirmRecharge}
                      disabled={recharging}
                      className="flex-1 py-3.5 rounded-2xl items-center flex-row justify-center"
                      style={{ backgroundColor: COLORS.primary, opacity: recharging ? 0.6 : 1 }}
                    >
                      {recharging ? <Spinner size={16} color="#FFF" /> : <CreditCard size={14} color="#FFF" />}
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
                  className="py-3.5 rounded-2xl items-center flex-row justify-center"
                  style={{ backgroundColor: COLORS.primary, opacity: previewLoading ? 0.6 : 1 }}
                >
                  {previewLoading ? <Spinner size={16} color="#FFF" /> : <CreditCard size={14} color="#FFF" />}
                  <Text className="text-white text-sm font-bold ml-2">
                    {previewLoading ? 'Loading…' : 'Review & Renew'}
                  </Text>
                </TouchableOpacity>
              )}
              {rechargeError ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold text-center mt-3">{rechargeError}</Text>
              ) : null}
            </View>
          ) : renewalStatus === 'scheduled' ? (
            <View
              className="rounded-2xl border p-4 mb-7 flex-row items-center"
              style={{ backgroundColor: COLORS.success + '0A', borderColor: COLORS.success + '26' }}
            >
              <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.success + '1A' }}>
                <ShieldCheck size={16} color={COLORS.success} />
              </View>
              <View className="flex-1 ml-3">
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">
                  Renewal scheduled — starts {formatDate(booking?.scheduled_start_date ?? null)}
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                  Your current plan stays active until then. No action needed.
                </Text>
              </View>
            </View>
          ) : (
            <View
              className="rounded-2xl border p-4 mb-7 flex-row items-center"
              style={{ backgroundColor: COLORS.success + '0A', borderColor: COLORS.success + '26' }}
            >
              <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.success + '1A' }}>
                <ShieldCheck size={16} color={COLORS.success} />
              </View>
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold ml-3">
                All payments are clear — no amount due.
              </Text>
            </View>
          )}

          {/* Security deposit */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-3">Security Deposit</Text>
          <View
            className="rounded-2xl border mb-7 overflow-hidden"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
          >
            <View className="p-5 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.primary + '14' }}>
                  <ShieldCheck size={16} color={COLORS.primary} />
                </View>
                <View className="ml-3">
                  <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">₹{(deposit?.amount ?? 0).toFixed(0)}</Text>
                  {/*
                    'refunded' and 'partially_refunded' collapsed into
                    'released'. The distinction was the deposit row holding an
                    opinion about how much came back; the refund itself is
                    where that amount lives, and the two could disagree.
                    'forfeited' reads as "retained," in neutral/amber, not a
                    bright red "FORFEITED" stamp — attention, not alarm.
                  */}
                  {deposit?.status === 'released' && deposit.refunded_at ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      Released {formatDate(deposit.refunded_at)}
                    </Text>
                  ) : deposit?.status === 'forfeited' ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      Retained for damage deductions
                    </Text>
                  ) : deposit?.status === 'held' && deposit.refund_eligible_at ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                      Refund eligible from {formatDate(deposit.refund_eligible_at)}
                    </Text>
                  ) : null}
                </View>
              </View>
              {deposit ? (
                <Badge
                  label={deposit.status === 'forfeited' ? 'Deposit Retained' : DEPOSIT_STATUS_LABEL[deposit.status]}
                  tone={deposit.status === 'forfeited' ? 'warning' : DEPOSIT_STATUS_TONE[deposit.status]}
                />
              ) : null}
            </View>

            {/* Damage charges live here, as one deposit breakdown, instead
                of a second section repeating the same rows — every damage
                (not just settled ones) shown as a transaction line, disputed
                ones flagged inline rather than in a separate list. */}
            {damages.length > 0 && (
              <View className="px-5 pb-5 pt-1" style={{ borderTopWidth: 1, borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold uppercase tracking-wider mb-2 mt-2">
                  Damage Charges
                </Text>
                {damages.map((d) => (
                  <View key={d.id} className="flex-row items-center justify-between py-1.5">
                    <View className="flex-1 pr-2">
                      <Text style={{ color: COLORS.textSecondary }} className="text-[13px] font-medium">
                        {d.description}
                      </Text>
                      {d.status === 'disputed' ? (
                        <View className="flex-row items-center mt-0.5">
                          <View className="w-1 h-1 rounded-full mr-1.5" style={{ backgroundColor: COLORS.warning }} />
                          <Text style={{ color: COLORS.warning }} className="text-[10px] font-semibold">Under review</Text>
                        </View>
                      ) : (
                        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium opacity-70">
                          {formatDate(d.created_at)}
                        </Text>
                      )}
                    </View>
                    <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-semibold">
                      -₹{d.deposit_deduction.toFixed(0)}
                    </Text>
                  </View>
                ))}
                {deposit && (
                  <>
                    <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
                    {totalAdditionalDue > 0 ? (
                      <View className="flex-row items-center justify-between py-1">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">Additional Amount Due</Text>
                        <Text style={{ color: COLORS.textPrimary }} className="text-lg font-bold">₹{totalAdditionalDue.toFixed(0)}</Text>
                      </View>
                    ) : (
                      <View className="flex-row items-center justify-between py-1">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">Net Refund</Text>
                        <Text style={{ color: COLORS.primary }} className="text-lg font-bold">
                          ₹{Math.max(0, (deposit.amount - totalDeduction)).toFixed(0)}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </View>

          {/* Payment history — a transaction timeline, one soft card per
              entry, rather than one bordered list with internal dividers. */}
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold mb-3">Payment History</Text>
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} title="No payments yet" />
          ) : (
            invoices.map((inv) => {
              const hasItems = inv.items.length > 0;
              const expanded = expandedInvoiceId === inv.id;
              return (
                <View
                  key={inv.id}
                  className="rounded-2xl border mb-3 overflow-hidden"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, shadowColor: COLORS.black, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}
                >
                  <TouchableOpacity
                    className="p-4 flex-row items-center justify-between"
                    disabled={!hasItems}
                    onPress={() => setExpandedInvoiceId(expanded ? null : inv.id)}
                  >
                    <View className="flex-1 pr-3">
                      <Text style={{ color: COLORS.textPrimary }} className="text-sm font-semibold">
                        {invoiceLabel(inv)}
                      </Text>
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                        {formatDate(inv.paid_at ?? inv.due_on)}
                        {hasItems ? (expanded ? '  ▲' : '  ▼') : ''}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text style={{ color: COLORS.textPrimary }} className="text-base font-bold mb-1">₹{inv.total_amount.toFixed(0)}</Text>
                      <Badge label={PAYMENT_STATE_LABEL[inv.payment_state]} tone={PAYMENT_STATE_TONE[inv.payment_state]} />
                    </View>
                  </TouchableOpacity>
                  {expanded && hasItems ? (
                    <View className="px-4 pb-4 pt-1" style={{ borderTopWidth: 1, borderColor: COLORS.border }}>
                      {inv.items.map((item) => (
                        <View key={item.id} className="flex-row items-center justify-between py-1.5">
                          {/*
                            A discount is an `adjustment` with a NEGATIVE
                            amount, not its own line type — which is what
                            let the old charge/discount pair collapse into
                            one signed path. Read the sign, not the type.
                          */}
                          <Text style={{ color: item.amount < 0 ? COLORS.success : COLORS.textSecondary }} className="text-[11px] font-medium">
                            {item.description}
                          </Text>
                          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                            {item.amount < 0 ? '-' : ''}₹{Math.abs(item.amount).toFixed(0)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
