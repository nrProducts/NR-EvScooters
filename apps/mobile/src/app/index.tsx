import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { authRepository, DEMO_ACCOUNTS } from '../services';
import { ENV } from '../constants/env';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { Bike, Mail, Lock, ArrowRight, Eye, EyeOff, Zap } from 'lucide-react-native';

/**
 * Real Supabase email/password sign-in. The previous version looked up a
 * hard-coded email in the mock store and called it a session — there was no
 * token, so no API call could ever have been authenticated.
 *
 * Roles are NOT decided here. After sign-in the auth store calls
 * GET /users/me and the backend tells us what this account may do.
 */
export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);

  // Mock mode has no passwords, so the field is hidden and demo accounts are
  // offered as one-tap buttons instead.
  const needsPassword = authRepository.requiresPassword;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const attemptLogin = async (asEmail: string = email) => {
    if (loading) return;

    if (!asEmail.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    if (needsPassword && !password) {
      setError('Please enter your password.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await signIn(asEmail, password);
      // The root layout redirects once the profile (and its roles) arrives.
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not sign in. Check your details and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = () => {
    if (!email.trim()) {
      Alert.alert('Email needed', 'Enter your email address first, then tap Forgot password.');
      return;
    }
    Alert.alert('Reset password', `Send a password reset link to ${email.trim()}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send link',
        onPress: async () => {
          try {
            await useAuthStore.getState().signOut();
            const { api } = await import('../lib/api');
            await api.sendPasswordReset(email);
            Alert.alert('Check your inbox', 'If that address has an account, a reset link is on its way.');
          } catch {
            // Deliberately identical to the success message: telling a stranger
            // whether an address exists is an account-enumeration leak.
            Alert.alert('Check your inbox', 'If that address has an account, a reset link is on its way.');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ backgroundColor: COLORS.background }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-1 px-6 justify-center py-16 items-center">
        {/* Brand */}
        <View className="items-center mb-10">
          <View
            className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Bike size={32} color="#FFF" />
          </View>
          <Text style={{ color: COLORS.textPrimary }} className="text-3xl font-black tracking-tight text-center">
            NR <Text style={{ color: COLORS.primary }}>FleetHub</Text>
          </Text>
          <Text
            style={{ color: COLORS.textSecondary }}
            className="text-sm font-medium mt-1.5 text-center px-4"
          >
            EV Scooter fleet management, for admins and riders.
          </Text>
        </View>

        {/* Form */}
        <View className="w-full max-w-[420px]">
          {loading ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary }} className="font-medium mt-4">
                Signing you in...
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
                Email Address
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
                  placeholder="you@fleet.com"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  accessibilityLabel="Email address"
                  className="flex-1 text-base font-semibold ml-3"
                  style={{ color: COLORS.textPrimary }}
                />
              </View>

              {needsPassword ? (
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
                      onSubmitEditing={() => void attemptLogin()}
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
              ) : null}

              {error ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-3 px-1">
                  {error}
                </Text>
              ) : (
                <View className="mb-3" />
              )}

              <TouchableOpacity
                onPress={() => void attemptLogin()}
                accessibilityRole="button"
                style={{ backgroundColor: COLORS.primary }}
                className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
              >
                <Text className="text-white font-bold text-base mr-2">Sign In</Text>
                <ArrowRight size={18} color="#FFF" />
              </TouchableOpacity>

              {needsPassword ? (
                <TouchableOpacity onPress={forgotPassword} accessibilityRole="button" className="mt-4">
                  <Text style={{ color: COLORS.textSecondary }} className="text-xs font-bold text-center">
                    Forgot password?
                  </Text>
                </TouchableOpacity>
              ) : null}

              {ENV.useMock ? (
                <View className="mt-8 pt-6 border-t" style={{ borderColor: COLORS.border }}>
                  <View className="flex-row items-center justify-center mb-3">
                    <Zap size={12} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning }} className="text-[11px] font-black uppercase tracking-wider ml-1.5">
                      Demo Mode — No Backend
                    </Text>
                  </View>
                  <Text
                    style={{ color: COLORS.textSecondary }}
                    className="text-[11px] font-medium text-center mb-4 leading-relaxed"
                  >
                    Data is in-memory and resets on reload. Tap an account to sign in.
                  </Text>

                  <View style={{ gap: 8 }}>
                    {DEMO_ACCOUNTS.map((acct) => (
                      <TouchableOpacity
                        key={acct.email}
                        onPress={() => void attemptLogin(acct.email)}
                        accessibilityRole="button"
                        accessibilityLabel={`Sign in as ${acct.label}`}
                        className="flex-row items-center px-4 py-3 rounded-2xl border"
                        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
                      >
                        <View
                          className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                          style={{ backgroundColor: COLORS.primary + '14' }}
                        >
                          <Text style={{ color: COLORS.primary }} className="text-[11px] font-black">
                            {acct.label[0]}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold">
                            {acct.label}
                          </Text>
                          <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-medium mt-0.5">
                            {acct.hint}
                          </Text>
                        </View>
                        <ArrowRight size={14} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View className="mt-8 pt-6 border-t" style={{ borderColor: COLORS.border }}>
                  <Text
                    style={{ color: COLORS.textSecondary }}
                    className="text-[11px] font-medium text-center leading-relaxed"
                  >
                    Accounts are created by an administrator. If you were invited, use the link in
                    your email to set a password first.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
