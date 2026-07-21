import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useFleetStore } from '../store/useFleetStore';
import { useRentGate } from '../hooks/useRentGate';
import { COLORS } from '../constants/theme';
import { Bike, BatteryFull, Hash, Calendar, Wrench, ShieldCheck, Zap } from 'lucide-react-native';
import { VehicleStatus } from '../types/fleet';

const STATUS_TONE: Record<VehicleStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  assigned: 'neutral',
  charging: 'warning',
  maintenance: 'danger',
};

export default function MyScooterScreen() {
  const user = useFleetStore(s => s.getCurrentUser());
  const vehicle = useFleetStore(s => s.getVehicleById(user?.assignedVehicleId));
  const { attemptRent } = useRentGate();
  const [rented, setRented] = useState(false);

  const onRentPress = () => {
    if (attemptRent()) setRented(true);
  };

  return (
    <AppShell title="My Scooter">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {!vehicle ? (
          <EmptyState
            icon={Bike}
            title="No scooter assigned"
            subtitle="Reach out to support and we'll get a vehicle assigned to your account."
          />
        ) : (
          <>
            <View className="rounded-3xl p-5 mb-4 items-center" style={{ backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border }}>
              <View className="w-16 h-16 rounded-3xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                <Bike size={30} color={COLORS.primary} />
              </View>
              <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">{vehicle.name}</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5 mb-3">{vehicle.manufacturer} • {vehicle.model}</Text>
              <Badge label={vehicle.status} tone={STATUS_TONE[vehicle.status]} />

              <View className="flex-row items-center mt-5 px-5 py-3 rounded-2xl w-full justify-center" style={{ backgroundColor: COLORS.background }}>
                <BatteryFull size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black ml-2">{vehicle.batteryPercent}%</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium ml-1.5">battery</Text>
              </View>
            </View>

            <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
              <DetailRow icon={Hash} label="Vehicle Number" value={vehicle.vehicleNumber} first />
              <DetailRow icon={ShieldCheck} label="Registration Number" value={vehicle.registrationNumber} />
              {vehicle.vin && <DetailRow icon={Hash} label="VIN" value={vehicle.vin} />}
              <DetailRow icon={Calendar} label="Last Service Date" value={vehicle.lastServiceDate} />
              <DetailRow icon={Wrench} label="Next Service Due" value={vehicle.nextServiceDue} />
            </View>

            {rented ? (
              <View
                className="rounded-2xl p-4 mt-4 items-center"
                style={{ backgroundColor: COLORS.success + '14', borderWidth: 1, borderColor: COLORS.success + '33' }}
              >
                <ShieldCheck size={22} color={COLORS.success} />
                <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold mt-2">
                  Scooter unlocked
                </Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mt-1">
                  Booking isn't live yet — this confirms your KYC gate is working.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={onRentPress}
                accessibilityRole="button"
                className="rounded-2xl py-4 mt-4 flex-row items-center justify-center"
                style={{ backgroundColor: COLORS.primary }}
              >
                <Zap size={17} color="#FFF" />
                <Text className="text-white font-bold text-sm ml-2">Rent this Scooter</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </AppShell>
  );
}

function DetailRow({ icon: Icon, label, value, first }: { icon: any; label: string; value: string; first?: boolean }) {
  return (
    <View className="flex-row items-center px-4 py-3.5" style={{ borderTopWidth: first ? 0 : 1, borderColor: COLORS.border }}>
      <Icon size={15} color={COLORS.textSecondary} />
      <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold ml-2.5 flex-1">{label}</Text>
      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">{value}</Text>
    </View>
  );
}
