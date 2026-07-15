import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { AppShell } from '../components/AppShell';
import { COLORS } from '../constants/theme';
import { LifeBuoy, Mail, Phone, MessageCircle } from 'lucide-react-native';

const CHANNELS = [
  { label: 'Call Support', desc: '+1 (800) 555-0199', icon: Phone, action: () => Linking.openURL('tel:+18005550199') },
  { label: 'Email Us', desc: 'support@nrfleethub.com', icon: Mail, action: () => Linking.openURL('mailto:support@nrfleethub.com') },
  { label: 'Live Chat', desc: 'Chat with our team, 9am–9pm', icon: MessageCircle, action: () => {} },
];

export default function SupportScreen() {
  return (
    <AppShell title="Support">
      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mb-6">
          <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: COLORS.primary + '14' }}>
            <LifeBuoy size={26} color={COLORS.primary} />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">How can we help?</Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-1 text-center px-6">
            Reach the NR FleetHub support team for scooter, billing, or account issues.
          </Text>
        </View>

        <View className="gap-3">
          {CHANNELS.map(c => (
            <TouchableOpacity
              key={c.label}
              onPress={c.action}
              className="rounded-2xl p-4 border flex-row items-center"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: COLORS.primary + '14' }}>
                <c.icon size={17} color={COLORS.primary} />
              </View>
              <View>
                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">{c.label}</Text>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-0.5">{c.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </AppShell>
  );
}
