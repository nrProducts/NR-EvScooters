import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { ArrowLeftRight, Bike, User, Check, Unlink } from 'lucide-react-native';

export default function AssignScreen() {
  const vehicles = useFleetStore(s => s.vehicles);
  const users = useFleetStore(s => s.users);
  const assignVehicle = useFleetStore(s => s.assignVehicle);
  const unassignVehicle = useFleetStore(s => s.unassignVehicle);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const availableVehicles = vehicles.filter(v => v.status === 'available');
  const unassignedUsers = users.filter(u => u.role === 'user' && u.status === 'active' && !u.assignedVehicleId);
  const assignedPairs = vehicles.filter(v => v.assignedUserId);

  const handleAssign = () => {
    if (!selectedVehicleId || !selectedUserId) {
      Alert.alert('Select both', 'Please choose an available vehicle and a rider to assign it to.');
      return;
    }
    assignVehicle(selectedVehicleId, selectedUserId);
    setSelectedVehicleId(null);
    setSelectedUserId(null);
    Alert.alert('Assigned', 'Vehicle has been assigned successfully.');
  };

  const handleUnassign = (vehicleId: string) => {
    unassignVehicle(vehicleId);
  };

  return (
    <AppShell title="Assign Vehicles">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-1">Assign a Vehicle</Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-5">
          Pick an available scooter and an unassigned rider
        </Text>

        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider mb-2">
          Available Vehicles ({availableVehicles.length})
        </Text>
        {availableVehicles.length === 0 ? (
          <View className="rounded-2xl border p-4 mb-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">No available vehicles right now.</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-5">
            {availableVehicles.map(v => {
              const sel = selectedVehicleId === v.id;
              return (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => setSelectedVehicleId(v.id)}
                  className="flex-row items-center px-3.5 py-2.5 rounded-xl border"
                  style={{ backgroundColor: sel ? COLORS.primary + '14' : COLORS.card, borderColor: sel ? COLORS.primary : COLORS.border }}
                >
                  <Bike size={14} color={sel ? COLORS.primary : COLORS.textSecondary} />
                  <Text style={{ color: sel ? COLORS.primary : COLORS.textPrimary }} className="text-xs font-bold ml-2">{v.vehicleNumber}</Text>
                  {sel && <Check size={13} color={COLORS.primary} className="ml-1.5" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider mb-2">
          Unassigned Riders ({unassignedUsers.length})
        </Text>
        {unassignedUsers.length === 0 ? (
          <View className="rounded-2xl border p-4 mb-5" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">No unassigned riders right now.</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-6">
            {unassignedUsers.map(u => {
              const sel = selectedUserId === u.id;
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => setSelectedUserId(u.id)}
                  className="flex-row items-center px-3.5 py-2.5 rounded-xl border"
                  style={{ backgroundColor: sel ? COLORS.primary + '14' : COLORS.card, borderColor: sel ? COLORS.primary : COLORS.border }}
                >
                  <User size={14} color={sel ? COLORS.primary : COLORS.textSecondary} />
                  <Text style={{ color: sel ? COLORS.primary : COLORS.textPrimary }} className="text-xs font-bold ml-2">{u.name}</Text>
                  {sel && <Check size={13} color={COLORS.primary} className="ml-1.5" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          onPress={handleAssign}
          disabled={!selectedVehicleId || !selectedUserId}
          className="w-full py-4 rounded-2xl flex-row justify-center items-center mb-8"
          style={{ backgroundColor: (!selectedVehicleId || !selectedUserId) ? COLORS.border : COLORS.primary }}
        >
          <ArrowLeftRight size={16} color="#FFF" />
          <Text className="text-white font-bold text-sm ml-2">Assign Vehicle</Text>
        </TouchableOpacity>

        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mb-3">Currently Assigned</Text>
        {assignedPairs.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="No active assignments" />
        ) : (
          <View className="gap-2.5">
            {assignedPairs.map(v => {
              const rider = users.find(u => u.id === v.assignedUserId);
              return (
                <View
                  key={v.id}
                  className="flex-row items-center justify-between rounded-2xl border p-3.5"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                >
                  <View className="flex-row items-center flex-1">
                    <Bike size={14} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold ml-2">{v.vehicleNumber}</Text>
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mx-2">→</Text>
                    <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">{rider?.name ?? 'Unknown'}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUnassign(v.id)}
                    className="flex-row items-center px-2.5 py-1.5 rounded-lg"
                    style={{ backgroundColor: COLORS.danger + '10' }}
                  >
                    <Unlink size={12} color={COLORS.danger} />
                    <Text style={{ color: COLORS.danger }} className="text-[10px] font-bold ml-1">Unassign</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}
