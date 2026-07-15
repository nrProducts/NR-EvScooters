import React from 'react';
import { View, Text, ScrollView, Switch } from 'react-native';
import { AppShell } from '../components/AppShell';
import { COLORS } from '../constants/theme';
import { Bell, Moon, Shield, Globe } from 'lucide-react-native';
import { useState } from 'react';

const ROWS = [
  { label: 'Push Notifications', desc: 'Low battery, maintenance, plan expiry alerts', icon: Bell },
  { label: 'Dark Mode', desc: 'Switch the console to a dark palette', icon: Moon },
  { label: 'Two-Factor Login', desc: 'Require a verification code at sign-in', icon: Shield },
  { label: 'Regional Format', desc: 'Use metric units and local currency', icon: Globe },
];

export default function SettingsScreen() {
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    'Push Notifications': true,
    'Dark Mode': false,
    'Two-Factor Login': false,
    'Regional Format': true,
  });

  return (
    <AppShell title="Settings">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-1">Console Settings</Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mb-5">
          Preferences for this admin console
        </Text>

        <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}>
          {ROWS.map((row, idx) => (
            <View
              key={row.label}
              className="flex-row items-center px-4 py-4"
              style={{ borderTopWidth: idx === 0 ? 0 : 1, borderColor: COLORS.border }}
            >
              <View className="w-9 h-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                <row.icon size={16} color={COLORS.primary} />
              </View>
              <View className="flex-1 mr-2">
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">{row.label}</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{row.desc}</Text>
              </View>
              <Switch
                value={toggles[row.label]}
                onValueChange={(v) => setToggles(prev => ({ ...prev, [row.label]: v }))}
                trackColor={{ false: COLORS.border, true: COLORS.primary + '80' }}
                thumbColor={toggles[row.label] ? COLORS.primary : '#FFF'}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </AppShell>
  );
}
