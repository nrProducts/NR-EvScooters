import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { AppShell } from '../components/AppShell';
import { StatCard } from '../components/ui/StatCard';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import {
  Users, Bike, UserCheck, Link2, Unlink, BatteryCharging, Wrench,
  CreditCard, XCircle, DollarSign, PieChart, TrendingUp, Activity as ActivityIcon,
  UserPlus, Wrench as WrenchIcon, RefreshCcw
} from 'lucide-react-native';

const ACTIVITY_ICON: Record<string, any> = {
  assignment: Link2,
  unassignment: Unlink,
  maintenance: WrenchIcon,
  plan: RefreshCcw,
  user: UserPlus,
  vehicle: Bike,
};

export default function DashboardScreen() {
  const users = useFleetStore(s => s.users);
  const vehicles = useFleetStore(s => s.vehicles);
  const plans = useFleetStore(s => s.plans);
  const activity = useFleetStore(s => s.activity);

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const totalScooters = vehicles.length;
  const assignedScooters = vehicles.filter(v => v.status === 'assigned').length;
  const unassignedScooters = vehicles.filter(v => v.status === 'available').length;
  const chargingScooters = vehicles.filter(v => v.status === 'charging').length;
  const maintenanceScooters = vehicles.filter(v => v.status === 'maintenance').length;
  const activePlans = plans.filter(p => p.active).length;
  const expiredPlans = plans.filter(p => !p.active).length;

  return (
    <AppShell title="Dashboard">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-1">Fleet Overview</Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-5">
          Live snapshot of your users, vehicles, and plans
        </Text>

        <View className="flex-row flex-wrap justify-between">
          <StatCard label="Total Users" value={totalUsers} icon={Users} tint={COLORS.primary} />
          <StatCard label="Active Users" value={activeUsers} icon={UserCheck} tint={COLORS.success} />
          <StatCard label="Total Scooters" value={totalScooters} icon={Bike} tint={COLORS.primary} />
          <StatCard label="Assigned Scooters" value={assignedScooters} icon={Link2} tint={COLORS.secondary} />
          <StatCard label="Unassigned Scooters" value={unassignedScooters} icon={Unlink} tint={COLORS.textSecondary} />
          <StatCard label="Charging" value={chargingScooters} icon={BatteryCharging} tint={COLORS.warning} />
          <StatCard label="In Maintenance" value={maintenanceScooters} icon={Wrench} tint={COLORS.danger} />
          <StatCard label="Active Plans" value={activePlans} icon={CreditCard} tint={COLORS.success} />
          <StatCard label="Expired / Inactive Plans" value={expiredPlans} icon={XCircle} tint={COLORS.danger} />
          <StatCard label="Revenue (est.)" value="$4,820" icon={DollarSign} tint={COLORS.primary} />
        </View>

        {/* CHART PLACEHOLDERS */}
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-2 mb-3">Fleet Analytics</Text>
        <View className="flex-row flex-wrap justify-between mb-2">
          {[
            { label: 'Vehicle Status Split', icon: PieChart },
            { label: 'Active Plans Trend', icon: TrendingUp },
            { label: 'Scooter Usage', icon: ActivityIcon },
            { label: 'Daily Rentals', icon: BatteryCharging },
          ].map(chart => (
            <View
              key={chart.label}
              className="rounded-2xl border items-center justify-center py-8 mb-3"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, width: '48%' }}
            >
              <chart.icon size={26} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold mt-2 text-center px-3">{chart.label}</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-[9px] mt-1 opacity-60">Chart coming soon</Text>
            </View>
          ))}
        </View>

        {/* RECENT ACTIVITY */}
        <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold mt-3 mb-3">Recent Activity</Text>
        <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          {activity.slice(0, 8).map((entry, idx) => {
            const Icon = ACTIVITY_ICON[entry.type] ?? ActivityIcon;
            return (
              <View
                key={entry.id}
                className="flex-row items-start px-4 py-3.5"
                style={{ borderTopWidth: idx === 0 ? 0 : 1, borderColor: COLORS.border }}
              >
                <View className="w-8 h-8 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                  <Icon size={14} color={COLORS.primary} />
                </View>
                <View className="flex-1">
                  <Text style={{ color: COLORS.textPrimary }} className="text-xs font-semibold">{entry.message}</Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium mt-0.5">{entry.timestamp}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </AppShell>
  );
}
