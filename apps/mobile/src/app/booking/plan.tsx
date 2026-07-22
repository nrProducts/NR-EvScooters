import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { EmptyState } from '../../components/ui/EmptyState';
import { useBookingStore } from '../../store/useBookingStore';
import { COLORS } from '../../constants/theme';
import type { ApiPlan } from '../../types/api';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

export default function PlanSelectionScreen() {
  const router = useRouter();
  const { draft, setPlan } = useBookingStore();

  // Guard: this screen only makes sense mid-flow. If the draft is missing
  // its earlier steps (e.g. a deep link or a reload), send the rider back
  // to start over rather than rendering a broken plan list.
  useEffect(() => {
    if (!draft.vehicleModel || !draft.station || !draft.startDay) {
      router.replace((draft.vehicleModel ? `/booking/${draft.vehicleModel.id}` : '/home') as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (plan: ApiPlan) => {
    setPlan(plan);
    router.push('/booking/billing');
  };

  const plans = draft.vehicleModel?.plans ?? [];

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
          Choose a Plan
        </Text>
      </View>

      {plans.length === 0 ? (
        <EmptyState icon={ChevronRight} title="No plans available" subtitle="Check back later for pricing on this scooter." />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40, gap: 12 }}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              onPress={() => handleSelect(plan)}
              className="rounded-2xl p-4 border flex-row items-center justify-between"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                  {CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                </Text>
                {plan.included_minutes != null ? (
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                    {plan.included_minutes} minutes included
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center">
                <Text style={{ color: COLORS.primaryPressed }} className="text-sm font-extrabold mr-2">
                  ₹{plan.price.toFixed(0)}
                </Text>
                <ChevronRight size={16} color={COLORS.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
