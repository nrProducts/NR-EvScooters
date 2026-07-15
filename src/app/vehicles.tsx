import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { Search, Plus, Bike, BatteryFull, Battery, BatteryLow, Wrench } from 'lucide-react-native';
import { VehicleStatus } from '../types/fleet';

const STATUS_TONE: Record<VehicleStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  assigned: 'neutral',
  charging: 'warning',
  maintenance: 'danger',
};

function batteryIcon(percent: number) {
  if (percent < 25) return BatteryLow;
  if (percent < 70) return Battery;
  return BatteryFull;
}

export default function VehiclesScreen() {
  const vehicles = useFleetStore(s => s.vehicles);
  const users = useFleetStore(s => s.users);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.vehicleNumber.toLowerCase().includes(q) ||
      v.registrationNumber.toLowerCase().includes(q) ||
      v.status.includes(q)
    );
  }, [vehicles, query]);

  return (
    <AppShell title="Manage Vehicles">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">Vehicle Fleet</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
              {vehicles.length} scooters registered
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('Coming Soon', 'Add / Edit / Delete Vehicle actions arrive in Phase 2 of this build.')}
            className="flex-row items-center px-3.5 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Plus size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-1.5">Add Vehicle</Text>
          </TouchableOpacity>
        </View>

        <View
          className="flex-row items-center rounded-2xl px-4 py-3 mb-5 border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <Search size={16} color={COLORS.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, number, plate or status..."
            placeholderTextColor={COLORS.textSecondary}
            className="flex-1 text-sm font-semibold ml-2.5"
            style={{ color: COLORS.textPrimary }}
          />
        </View>

        {filtered.length === 0 ? (
          <EmptyState icon={Bike} title="No vehicles found" subtitle="Try a different search term." />
        ) : (
          <View className="gap-3">
            {filtered.map(v => {
              const assignedUser = users.find(u => u.id === v.assignedUserId);
              const BattIcon = batteryIcon(v.batteryPercent);
              return (
                <View
                  key={v.id}
                  className="rounded-2xl p-4 border"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-row items-center flex-1 mr-3">
                      <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                        <Bike size={18} color={COLORS.primary} />
                      </View>
                      <View className="flex-1">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{v.name}</Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{v.vehicleNumber} • {v.manufacturer} {v.model}</Text>
                      </View>
                    </View>
                    <Badge label={v.status} tone={STATUS_TONE[v.status]} />
                  </View>

                  <View className="flex-row items-center justify-between pt-3 border-t" style={{ borderColor: COLORS.border }}>
                    <View className="flex-row items-center">
                      <BattIcon size={14} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-1.5">{v.batteryPercent}%</Text>
                    </View>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                      Reg: {v.registrationNumber}
                    </Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
                      {assignedUser ? assignedUser.name : 'Unassigned'}
                    </Text>
                  </View>

                  {v.status === 'maintenance' && (
                    <View className="flex-row items-center mt-3 px-3 py-2 rounded-xl" style={{ backgroundColor: COLORS.danger + '10' }}>
                      <Wrench size={12} color={COLORS.danger} />
                      <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold ml-1.5">
                        Next service due {v.nextServiceDue}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}
