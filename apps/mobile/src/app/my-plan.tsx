import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { COLORS } from '../constants/theme';
import { BILLING_CYCLE_LABEL } from '../constants/status';
import { CreditCard } from 'lucide-react-native';
import { useCurrentRideOrBooking } from '../hooks/useCurrentRideOrBooking';

export default function MyPlanScreen() {
  const { state, loading, error, reload } = useCurrentRideOrBooking();
  const plan = state.kind === 'rental' ? state.rental.plan : state.kind === 'booking' ? state.booking.plan : null;

  return (
    <AppShell title="My Plan">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Current Plan</Text>

          {!plan ? (
            <EmptyState
              icon={CreditCard}
              title="No active plan"
              subtitle="Book a scooter to pick a plan — once picked up, its billing details will show up here."
            />
          ) : (
            <View className="rounded-3xl p-5 mb-2" style={{ backgroundColor: COLORS.primary }}>
              <View className="flex-row justify-between items-start mb-2">
                <Text className="text-white text-lg font-black">{plan.name}</Text>
              </View>
              <Text className="text-white/80 text-xs font-medium capitalize mb-4">
                {state.kind === 'booking'
                  ? 'Pending pickup'
                  : `Billed ${BILLING_CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}`}
              </Text>
              <Text className="text-white text-3xl font-black">
                ₹{plan.price.toFixed(0)}{' '}
                <Text className="text-sm font-medium text-white/70">
                  / {BILLING_CYCLE_LABEL[plan.billing_cycle] ?? plan.billing_cycle}
                </Text>
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
