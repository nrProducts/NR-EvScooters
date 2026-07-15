import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { Plus, Check, CreditCard } from 'lucide-react-native';

export default function PlansScreen() {
  const plans = useFleetStore(s => s.plans);

  return (
    <AppShell title="Plans">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-5">
          <View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">Subscription Plans</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
              {plans.length} plan tiers configured
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('Coming Soon', 'Add / Edit / Delete Plan actions arrive in Phase 5 of this build.')}
            className="flex-row items-center px-3.5 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Plus size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-1.5">Add Plan</Text>
          </TouchableOpacity>
        </View>

        <View className="gap-3">
          {plans.map(plan => (
            <View
              key={plan.id}
              className="rounded-2xl p-4 border"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-row items-center flex-1 mr-3">
                  <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                    <CreditCard size={18} color={COLORS.primary} />
                  </View>
                  <View>
                    <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{plan.name}</Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5 capitalize">{plan.tier} plan • {plan.duration}</Text>
                  </View>
                </View>
                <Badge label={plan.active ? 'active' : 'inactive'} tone={plan.active ? 'success' : 'neutral'} />
              </View>

              <View className="flex-row items-center justify-between pt-3 border-t" style={{ borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.primary }} className="text-lg font-black">
                  ${plan.price.toFixed(2)}
                </Text>
                {plan.maxDistanceKm ? (
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                    Up to {plan.maxDistanceKm} km/day
                  </Text>
                ) : null}
              </View>

              {plan.benefits && plan.benefits.length > 0 && (
                <View className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.border }}>
                  {plan.benefits.map(b => (
                    <View key={b} className="flex-row items-center mb-1.5">
                      <Check size={12} color={COLORS.success} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-medium ml-2">{b}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </AppShell>
  );
}
