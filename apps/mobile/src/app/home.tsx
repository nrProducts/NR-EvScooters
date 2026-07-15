import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { Bike, CreditCard, LifeBuoy, BatteryFull, ChevronRight } from 'lucide-react-native';

export default function HomeScreen() {
  const router = useRouter();
  const user = useFleetStore(s => s.getCurrentUser());
  const vehicle = useFleetStore(s => s.getVehicleById(user?.assignedVehicleId));
  const plan = useFleetStore(s => s.getPlanById(user?.planId));

  if (!user) return null;

  return (
    <AppShell title="Home">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-0.5">Hi, {user.name.split(' ')[0]} 👋</Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-5">Here's what's happening with your ride today</Text>

        {/* ASSIGNED SCOOTER CARD */}
        <View className="rounded-3xl p-5 mb-4" style={{ backgroundColor: COLORS.primary }}>
          <View className="flex-row justify-between items-start mb-4">
            <View>
              <Text className="text-white/70 text-[10px] font-bold uppercase tracking-widest">My Scooter</Text>
              <Text className="text-white text-xl font-black mt-0.5">
                {vehicle ? vehicle.name : 'No Scooter Assigned'}
              </Text>
            </View>
            <View className="w-11 h-11 bg-white/15 rounded-2xl items-center justify-center">
              <Bike size={22} color="#FFF" />
            </View>
          </View>

          {vehicle ? (
            <View className="flex-row items-center justify-between bg-white/10 rounded-2xl px-4 py-3">
              <View className="flex-row items-center">
                <BatteryFull size={16} color="#FFF" />
                <Text className="text-white font-bold text-sm ml-2">{vehicle.batteryPercent}%</Text>
              </View>
              <Text className="text-white/80 text-xs font-semibold">{vehicle.vehicleNumber}</Text>
              <Badge label={vehicle.status} tone="neutral" />
            </View>
          ) : (
            <Text className="text-white/80 text-xs font-medium">
              You don't have a scooter assigned yet. Contact support to get one assigned.
            </Text>
          )}
        </View>

        {/* PLAN SUMMARY CARD */}
        <TouchableOpacity
          onPress={() => router.push('/my-plan')}
          className="rounded-2xl p-4 border flex-row items-center justify-between mb-3"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.secondary + '30' }}>
              <CreditCard size={18} color={COLORS.primaryPressed} />
            </View>
            <View className="flex-1">
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{plan ? plan.name : 'No Active Plan'}</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">
                {plan ? `$${plan.price.toFixed(2)} / ${plan.duration}` : 'Browse plans to get started'}
              </Text>
            </View>
          </View>
          <ChevronRight size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {/* QUICK NAV */}
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-2 mb-3">Quick Access</Text>
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => router.push('/my-scooter')}
            className="rounded-2xl p-4 border flex-row items-center justify-between"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
          >
            <View className="flex-row items-center">
              <Bike size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">My Scooter Details</Text>
            </View>
            <ChevronRight size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/support')}
            className="rounded-2xl p-4 border flex-row items-center justify-between"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
          >
            <View className="flex-row items-center">
              <LifeBuoy size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-3">Get Support</Text>
            </View>
            <ChevronRight size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AppShell>
  );
}
