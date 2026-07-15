import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui/EmptyState';
import { COLORS } from '../constants/theme';
import { BarChart3, TrendingUp, Bike, Users, CreditCard, Activity } from 'lucide-react-native';

const PLANNED_REPORTS = [
  { label: 'Daily Usage', icon: Activity },
  { label: 'Monthly Usage', icon: TrendingUp },
  { label: 'Revenue', icon: BarChart3 },
  { label: 'Vehicle Utilization', icon: Bike },
  { label: 'Active Plans', icon: CreditCard },
  { label: 'User Activity', icon: Users },
];

export default function ReportsScreen() {
  return (
    <AppShell title="Reports">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-1">Fleet Reports</Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-5">
          Reporting module is on the roadmap — here's what's coming
        </Text>

        <View className="flex-row flex-wrap justify-between">
          {PLANNED_REPORTS.map(r => (
            <View
              key={r.label}
              className="rounded-2xl border items-center justify-center py-7 mb-3"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, width: '48%' }}
            >
              <r.icon size={22} color={COLORS.textSecondary} />
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold mt-2.5 text-center">{r.label}</Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-[9px] mt-1 opacity-70">Coming soon</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </AppShell>
  );
}
