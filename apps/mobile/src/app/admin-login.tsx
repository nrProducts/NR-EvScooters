import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { authRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { ArrowLeft, Mail, Lock, Shield, Eye, EyeOff } from 'lucide-react-native';

/**
 * Admin sign-in. Deliberately NOT linked from the rider login (reached via the
 * hidden long-press on the logo) so riders never see it. Admin accounts are
 * created and granted the admin role out-of-band; there is no self-serve path.
 *
 * Authorization is still enforced server-side: this screen only establishes a
 * session. A non-admin who reached it and signed in would land on the rider
 * home like any other rider, because roles come from GET /users/me.
 */
export default function AdminLoginScreen() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const isMock = authRepository.isMock;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (loading) return;
    if (!email.trim()) {
      setError('Enter your admin email.');
      return;
    }
    if (!isMock && !password) {
      setError('Enter your password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // Root layout routes to /dashboard for admins.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ backgroundColor: COLORS.background }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-1 px-6 pt-16 pb-16">
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="w-10 h-10 rounded-2xl items-center justify-center mb-10 border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View
          className="w-14 h-14 rounded-3xl items-center justify-center mb-5"
          style={{ backgroundColor: COLORS.textPrimary }}
        >
          <Shield size={26} color="#FFF" />
        </View>
        <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mb-2">
          Admin sign-in
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mb-8">
          Staff access only. Riders should use the mobile-number login.
        </Text>

        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
          Email
        </Text>
        <View
          className="flex-row items-center rounded-2xl px-4 py-3.5 mb-3 border"
          style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
        >
          <Mail size={18} color={COLORS.textSecondary} />
          <TextInput
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError('');
            }}
            placeholder="admin@fleet.com"
            placeholderTextColor={COLORS.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel="Admin email"
            className="flex-1 text-base font-semibold ml-3"
            style={{ color: COLORS.textPrimary }}
            returnKeyType={isMock ? 'done' : 'next'}
            onSubmitEditing={() => (isMock ? void submit() : passwordRef.current?.focus())}
            blurOnSubmit={isMock}
          />
        </View>

        {!isMock ? (
          <>
            <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
              Password
            </Text>
            <View
              className="flex-row items-center rounded-2xl px-4 py-3.5 mb-2 border"
              style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
            >
              <Lock size={18} color={COLORS.textSecondary} />
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError('');
                }}
                placeholder="Your password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                accessibilityLabel="Password"
                className="flex-1 text-base font-semibold ml-3"
                style={{ color: COLORS.textPrimary }}
                onSubmitEditing={() => void submit()}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={16} color={COLORS.textSecondary} />
                ) : (
                  <Eye size={16} color={COLORS.textSecondary} />
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-2 px-1">
            Demo mode: enter admin@fleet.com (no password needed).
          </Text>
        )}

        {error ? (
          <Text style={{ color: COLORS.danger }} className="text-xs font-semibold my-3 px-1">
            {error}
          </Text>
        ) : (
          <View className="mb-3" />
        )}

        <TouchableOpacity
          onPress={() => void submit()}
          disabled={loading}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.textPrimary, opacity: loading ? 0.7 : 1 }}
          className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text className="text-white font-bold text-base">Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
