import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFleetStore } from '../store/useFleetStore';
import { COLORS } from '../constants/theme';
import { Bike, Mail, ArrowRight, ShieldCheck, User } from 'lucide-react-native';

export default function LoginScreen() {
  const login = useFleetStore(s => s.login);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const attemptLogin = (value: string) => {
    if (!value.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    setError('');
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      const success = login(value);
      if (!success) {
        setError('No active account found for this email. Try admin@fleet.com or rohan.mehta@fleet.com.');
        return;
      }
      // Root layout will redirect based on role once currentUserId updates
      router.replace('/');
    }, 500);
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ backgroundColor: COLORS.background }}
    >
      <View className="flex-1 px-6 justify-center py-16 items-center">

        {/* Brand */}
        <View className="items-center mb-10">
          <View className="w-16 h-16 rounded-3xl items-center justify-center mb-4" style={{ backgroundColor: COLORS.primary }}>
            <Bike size={32} color="#FFF" />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-3xl font-black tracking-tight text-center">
            NR <Text style={{ color: COLORS.primary }}>FleetHub</Text>
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mt-1.5 text-center px-4">
            EV Scooter fleet management, for admins and riders.
          </Text>
        </View>

        {/* Form */}
        <View className="w-full max-w-[420px]">
          {loading ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary }} className="font-medium mt-4">Signing you in...</Text>
            </View>
          ) : (
            <>
              <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">Email Address</Text>
              <View
                className="flex-row items-center rounded-2xl px-4 py-3.5 mb-2 border"
                style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
              >
                <Mail size={18} color={COLORS.textSecondary} />
                <TextInput
                  value={email}
                  onChangeText={(t) => { setEmail(t); if (error) setError(''); }}
                  placeholder="you@fleet.com"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="flex-1 text-base font-semibold ml-3"
                  style={{ color: COLORS.textPrimary }}
                  onSubmitEditing={() => attemptLogin(email)}
                />
              </View>

              {error ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-4 px-1">{error}</Text>
              ) : (
                <View className="mb-4" />
              )}

              <TouchableOpacity
                onPress={() => attemptLogin(email)}
                style={{ backgroundColor: COLORS.primary }}
                className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
              >
                <Text className="text-white font-bold text-base mr-2">Sign In</Text>
                <ArrowRight size={18} color="#FFF" />
              </TouchableOpacity>

              {/* Demo quick access */}
              <View className="mt-8 pt-6 border-t" style={{ borderColor: COLORS.border }}>
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold uppercase tracking-wider mb-3 text-center">
                  Quick Demo Access
                </Text>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => attemptLogin('admin@fleet.com')}
                    className="flex-1 py-3.5 rounded-2xl border items-center flex-row justify-center"
                    style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                  >
                    <ShieldCheck size={16} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textPrimary }} className="font-bold text-xs ml-2">Admin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => attemptLogin('rohan.mehta@fleet.com')}
                    className="flex-1 py-3.5 rounded-2xl border items-center flex-row justify-center"
                    style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                  >
                    <User size={16} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textPrimary }} className="font-bold text-xs ml-2">Rider</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
