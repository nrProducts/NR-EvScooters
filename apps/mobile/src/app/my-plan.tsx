import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { CreditCard, Check } from 'lucide-react-native';

export default function MyPlanScreen() {
  const user = useFleetStore(s => s.getCurrentUser());
  const plan = useFleetStore(s => s.getPlanById(user?.planId));
  const plans = useFleetStore(s => s.plans);

  return (
    <AppShell title="My Plan">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Current Plan</Text>

        {!plan ? (
          <EmptyState icon={CreditCard} title="No active plan" subtitle="Choose a plan below to get started." />
        ) : (
          <View className="rounded-3xl p-5 mb-2" style={{ backgroundColor: COLORS.primary }}>
            <View className="flex-row justify-between items-start mb-2">
              <Text className="text-white text-lg font-black">{plan.name}</Text>
              <Badge label={user?.membershipStatus ?? 'active'} tone="neutral" />
            </View>
            <Text className="text-white/80 text-xs font-medium capitalize mb-4">{plan.tier} plan • renews every {plan.duration}</Text>
            <Text className="text-white text-3xl font-black">
              ${plan.price.toFixed(2)} <Text className="text-sm font-medium text-white/70">/ {plan.duration}</Text>
            </Text>
          </View>
        )}

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-6 mb-3">Available Plans</Text>
        <View className="gap-3">
          {plans.filter(p => p.active).map(p => {
            const isCurrent = plan?.id === p.id;
            return (
              <View
                key={p.id}
                className="rounded-2xl p-4 border"
                style={{
                  backgroundColor: isCurrent ? COLORS.primary + '0D' : COLORS.card,
                  borderColor: isCurrent ? COLORS.primary : COLORS.border,
                }}
              >
                <View className="flex-row justify-between items-start mb-2">
                  <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{p.name}</Text>
                  {isCurrent && <Badge label="current" tone="primary" />}
                </View>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-3 capitalize">{p.tier} plan • {p.duration}</Text>
                <Text style={{ color: COLORS.primary }} className="text-xl font-black mb-2">${p.price.toFixed(2)}</Text>
                {p.maxDistanceKm ? (
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold mb-1">Up to {p.maxDistanceKm} km/day</Text>
                ) : null}
                {p.benefits?.map(b => (
                  <View key={b} className="flex-row items-center mt-1">
                    <Check size={11} color={COLORS.success} />
                    <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-medium ml-1.5">{b}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium text-center mt-6 px-4 leading-relaxed">
          Plan switching and checkout are coming in a later phase — for now this is a read-only view of available plans.
        </Text>
      </ScrollView>
    </AppShell>
  );
}
