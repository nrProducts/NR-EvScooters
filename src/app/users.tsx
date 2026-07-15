import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { Search, Plus, Users as UsersIcon, Bike, CreditCard } from 'lucide-react-native';

export default function UsersScreen() {
  const users = useFleetStore(s => s.users);
  const vehicles = useFleetStore(s => s.vehicles);
  const plans = useFleetStore(s => s.plans);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = users.filter(u => u.role === 'user');
    if (!q) return list;
    return list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <AppShell title="Manage Users">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">Riders</Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
              {users.filter(u => u.role === 'user').length} registered users
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => Alert.alert('Coming Soon', 'Add / Edit / Delete User actions arrive in Phase 3 of this build.')}
            className="flex-row items-center px-3.5 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Plus size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-1.5">Add User</Text>
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
            placeholder="Search by name or email..."
            placeholderTextColor={COLORS.textSecondary}
            className="flex-1 text-sm font-semibold ml-2.5"
            style={{ color: COLORS.textPrimary }}
          />
        </View>

        {filtered.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No users found" subtitle="Try a different search term." />
        ) : (
          <View className="gap-3">
            {filtered.map(u => {
              const vehicle = vehicles.find(v => v.id === u.assignedVehicleId);
              const plan = plans.find(p => p.id === u.planId);
              return (
                <View
                  key={u.id}
                  className="rounded-2xl p-4 border"
                  style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                >
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-row items-center flex-1 mr-3">
                      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                        <Text style={{ color: COLORS.primary }} className="text-sm font-black">{u.name.charAt(0)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">{u.name}</Text>
                        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{u.email}</Text>
                      </View>
                    </View>
                    <Badge label={u.status} tone={u.status === 'active' ? 'success' : 'neutral'} />
                  </View>

                  <View className="flex-row items-center justify-between pt-3 border-t" style={{ borderColor: COLORS.border }}>
                    <View className="flex-row items-center flex-1">
                      <Bike size={13} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-semibold ml-1.5">
                        {vehicle ? vehicle.vehicleNumber : 'No vehicle'}
                      </Text>
                    </View>
                    <View className="flex-row items-center flex-1 justify-end">
                      <CreditCard size={13} color={COLORS.textSecondary} />
                      <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-semibold ml-1.5">
                        {plan ? plan.name : 'No plan'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}
