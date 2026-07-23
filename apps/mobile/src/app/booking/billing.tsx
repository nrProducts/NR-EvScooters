import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, CheckCircle2, Bike, MapPin, Calendar, CreditCard } from 'lucide-react-native';
import { useBookingStore } from '../../store/useBookingStore';
import { useAuthStore } from '../../store/useAuthStore';
import { COLORS } from '../../constants/theme';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BillingScreen() {
  const router = useRouter();
  const { draft, creating, createError, created, createBooking, reset } = useBookingStore();
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  useEffect(() => {
    if (!created && (!draft.vehicleModel || !draft.station || !draft.startDay || !draft.plan)) {
      router.replace((draft.vehicleModel ? `/booking/${draft.vehicleModel.id}` : '/home') as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinueToPay = async () => {
    try {
      await createBooking();
    } catch {
      // createError is already set by the store; nothing further to do here.
    }
  };

  const handleDone = () => {
    reset();
    // has_active_booking only just became true server-side; without this the
    // store's stale profile would leave Home showing nothing about it until
    // some unrelated refresh happened to occur.
    void refreshProfile();
    router.replace('/home');
  };

  if (created) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-16 h-16 rounded-full items-center justify-center mb-5" style={{ backgroundColor: COLORS.success + '1A' }}>
            <CheckCircle2 size={32} color={COLORS.success} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black text-center">Booking Confirmed</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium text-center mt-2 leading-relaxed">
            Your {created.vehicle_model?.name ?? 'scooter'} is reserved for {formatDay(created.start_day)}. Head to your
            pickup station on that day — staff will assign your scooter there. Payment collection at checkout is coming
            in a later update.
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

  const { vehicleModel, station, startDay, plan } = draft;

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

      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
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
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">Plan price</Text>
            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">
              {plan ? `₹${plan.price.toFixed(0)}` : '—'}
            </Text>
          </View>
          <View className="h-px my-2" style={{ backgroundColor: COLORS.border }} />
          <View className="flex-row items-center justify-between">
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">Total due at pickup</Text>
            <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold">
              {plan ? `₹${plan.price.toFixed(0)}` : '—'}
            </Text>
          </View>
        </View>

        {createError ? (
          <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-4 text-center">
            {createError}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleContinueToPay}
          disabled={creating}
          className="py-4 rounded-2xl items-center flex-row justify-center"
          style={{ backgroundColor: COLORS.primary, opacity: creating ? 0.6 : 1 }}
        >
          <CreditCard size={16} color="#FFF" />
          <Text className="text-white text-sm font-bold ml-2">{creating ? 'Processing…' : 'Continue to Pay'}</Text>
        </TouchableOpacity>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-3">
          Payment isn&apos;t collected yet — this confirms your reservation now; checkout is coming in a later update.
        </Text>
      </ScrollView>
    </View>
  );
}
