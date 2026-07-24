import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { rentalRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { CreditCard } from 'lucide-react-native';
import type { ApiRental } from '../types/api';

const CYCLE_LABEL: Record<string, string> = {
  daily: 'Day', weekly: 'Week', monthly: 'Month', yearly: 'Year',
};

export default function MyPlanScreen() {
  const [rental, setRental] = useState<ApiRental | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void rentalRepository
      .mine()
      .then(setRental)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your plan.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <AppShell title="My Plan">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Current Plan</Text>

          {!rental?.plan ? (
            <EmptyState
              icon={CreditCard}
              title="No active plan"
              subtitle="Book a scooter to pick a plan — once picked up, its billing details will show up here."
            />
          ) : (
            <View className="rounded-3xl p-5 mb-2" style={{ backgroundColor: COLORS.primary }}>
              <View className="flex-row justify-between items-start mb-2">
                <Text className="text-white text-lg font-black">{rental.plan.name}</Text>
              </View>
              <Text className="text-white/80 text-xs font-medium capitalize mb-4">
                Billed {CYCLE_LABEL[rental.plan.billing_cycle] ?? rental.plan.billing_cycle}
              </Text>
              <Text className="text-white text-3xl font-black">
                ₹{rental.plan.price.toFixed(0)}{' '}
                <Text className="text-sm font-medium text-white/70">
                  / {CYCLE_LABEL[rental.plan.billing_cycle] ?? rental.plan.billing_cycle}
                </Text>
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </AppShell>
  );
}
