import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, CheckCircle2, Bike, MapPin, Calendar, CreditCard, ShieldCheck } from 'lucide-react-native';
import { useBookingStore } from '../../store/useBookingStore';
import { useAuthStore } from '../../store/useAuthStore';
import { billingRepository } from '../../services';
import { openRazorpayCheckout, PaymentCancelledError, PaymentUnavailableError } from '../../lib/razorpayCheckout';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import {
  FREE_CANCELLATION_GRACE_MINUTES, FREE_CANCELLATION_NOTICE_DAYS, LATE_CANCELLATION_PENALTY_RATE,
} from '../../lib/cancellationPolicy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BillingScreen() {
  // This screen renders its own header rather than AppShell's, so nothing
  // upstream pads the scroll tail past the Android nav/gesture bar.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { draft, creating, createError, created, createBooking, reset } = useBookingStore();
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    if (!created && (!draft.vehicleModel || !draft.station || !draft.startDay || !draft.plan)) {
      router.replace((draft.vehicleModel ? `/booking/${draft.vehicleModel.id}` : '/home') as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Display fields fall back to the draft until the booking exists, then
  // switch to the created booking's own embedded fields — createBooking()
  // clears the draft on success, so the review screen must not depend on it
  // once a retry (payment failed/cancelled) re-renders this screen.
  const vehicleModel = created?.vehicle_model ?? draft.vehicleModel;
  const station = created?.station ?? draft.station;
  const startDay = created?.start_day ?? draft.startDay;
  const plan = created?.plan ?? draft.plan;

  const handleContinueToPay = async () => {
    setPayError(null);
    try {
      const booking = created ?? (await createBooking());

      setPaying(true);
      const order = await billingRepository.createOrderForBooking(booking.id);
      // No Razorpay keys configured on the backend yet — the order was
      // already settled server-side with temp data. Skip Checkout entirely.
      if (!order.mock) {
        const verifyPayload = await openRazorpayCheckout({
          key: order.keyId,
          amount: Math.round(order.amount * 100),
          currency: order.currency,
          order_id: order.gatewayOrderId,
          name: 'NR EV Scooters',
          description: plan ? `${plan.name} — weekly rental + deposit` : 'Scooter rental',
          prefill: {
            email: profile?.email ?? undefined,
            contact: profile?.phone ?? undefined,
            name: profile?.full_name,
          },
          theme: { color: COLORS.primary },
        });
        await billingRepository.verifyPayment(verifyPayload);
      }
      setPaid(true);
    } catch (err) {
      if (err instanceof PaymentCancelledError) {
        setPayError('Payment was cancelled. Your reservation is still held — try again when ready.');
      } else if (err instanceof PaymentUnavailableError) {
        setPayError(err.message);
      } else if (err instanceof ApiError) {
        setPayError(err.message);
      } else {
        setPayError(createError ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  const handleDone = () => {
    reset();
    setPaid(false);
    // has_active_booking only just became true server-side; without this the
    // store's stale profile would leave Home showing nothing about it until
    // some unrelated refresh happened to occur.
    void refreshProfile();
    router.replace('/home');
  };

  if (created && paid) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-full items-center justify-center mb-5" style={{ backgroundColor: COLORS.success + '1A' }}>
            <CheckCircle2 size={32} color={COLORS.success} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">Booking Confirmed</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium text-center mt-2 leading-relaxed">
            Payment successful. Your {vehicleModel?.name ?? 'scooter'} is reserved for {startDay ? formatDay(startDay) : ''}.
            An admin will confirm your booking and assign your scooter shortly — head to your pickup station once you're notified.
          </Text>
          <TouchableOpacity
            onPress={handleDone}
            className="mt-8 py-4 px-8 rounded-2xl items-center"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Text className="text-white text-sm font-bold">Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const busy = creating || paying;
  const depositAmount = plan?.deposit_amount ?? 0;
  const rentalAmount = plan?.price ?? 0;
  const totalAmount = rentalAmount + depositAmount;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View
        className="flex-row items-center px-4 border-b"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 52, paddingBottom: 14 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: COLORS.background }}
        >
          <ChevronLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold flex-1">
          Review &amp; Pay
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Booking Summary</Text>
        <View className="rounded-2xl p-4 border mb-6 gap-4" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <View className="flex-row items-center">
            <Bike size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">{vehicleModel?.name ?? '—'}</Text>
          </View>
          <View className="flex-row items-center">
            <MapPin size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">{station?.name ?? '—'}</Text>
          </View>
          <View className="flex-row items-center">
            <Calendar size={16} color={COLORS.primary} />
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">
              {startDay ? formatDay(startDay) : '—'}
            </Text>
          </View>
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Plan</Text>
        <View className="rounded-2xl p-4 border mb-6" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <View className="flex-row items-center justify-between">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
              {plan ? (CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle) : '—'}
            </Text>
            <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold">
              {plan ? `₹${plan.price.toFixed(0)}` : '—'}
            </Text>
          </View>
        </View>

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Price Breakdown</Text>
        <View className="rounded-2xl p-4 border mb-6" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          <View className="flex-row items-center justify-between mb-2">
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">Weekly rental</Text>
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">₹{rentalAmount.toFixed(0)}</Text>
          </View>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <ShieldCheck size={12} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-1">Security deposit (refundable)</Text>
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">₹{depositAmount.toFixed(0)}</Text>
          </View>
          <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
          <View className="flex-row items-center justify-between">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Total to pay now</Text>
            <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold">₹{totalAmount.toFixed(0)}</Text>
          </View>
        </View>

        {payError ? (
          <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-4 text-center">
            {payError}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleContinueToPay}
          disabled={busy}
          className="py-4 rounded-2xl items-center flex-row justify-center"
          style={{ backgroundColor: COLORS.primary, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? <ActivityIndicator size="small" color="#FFF" /> : <CreditCard size={16} color="#FFF" />}
          <Text className="text-white text-sm font-bold ml-2">
            {paying ? 'Processing payment…' : creating ? 'Reserving…' : `Pay ₹${totalAmount.toFixed(0)}`}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-3">
          Your booking is confirmed only after payment succeeds. An admin then confirms the booking and assigns your scooter.
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-2">
          Free cancellation within {FREE_CANCELLATION_GRACE_MINUTES} minutes of booking, or any time up to{' '}
          {FREE_CANCELLATION_NOTICE_DAYS} days before pickup. After that a{' '}
          {Math.round(LATE_CANCELLATION_PENALTY_RATE * 100)}% fee applies.
        </Text>
      </ScrollView>
    </View>
  );
}
