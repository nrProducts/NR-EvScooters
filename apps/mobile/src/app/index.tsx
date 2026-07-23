import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { authRepository, DEMO_ACCOUNTS } from '../services';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { isValidPhone, toE164 } from '../lib/authValidation';
import { Bike, Phone, ArrowRight, Zap } from 'lucide-react-native';

/**
 * Primary rider login = phone + OTP. Google is offered as a secondary /
 * recovery method. Admins get NO visible entry point here (there is a hidden
 * long-press on the logo -> /admin-login) so riders never see an admin option.
 * In mock mode the demo accounts remain available.
 */
export default function LoginScreen() {
  const router = useRouter();
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signIn = useAuthStore((s) => s.signIn);

  const isMock = authRepository.isMock;

  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<'otp' | 'google' | 'demo' | null>(null);
  const [error, setError] = useState('');

  const sendCode = async () => {
    if (busy) return;
    if (!isValidPhone(phone)) {
      setError('Enter a valid mobile number.');
      return;
    }
    const e164 = toE164(phone);
    setError('');
    setBusy('otp');
    try {
      await requestOtp(e164);
      router.push({ pathname: '/otp-verify', params: { phone: e164 } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const continueWithGoogle = async () => {
    if (busy) return;
    setError('');
    setBusy('google');
    try {
      await signInWithGoogle();
      // Root layout routes onward once the profile arrives.
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CANCELLED') {
        setBusy(null);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const demoLogin = async (email: string) => {
    if (busy) return;
    setError('');
    setBusy('demo');
    try {
      await signIn(email, '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(null);
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
      <View className="flex-1 px-6 justify-center py-16 items-center">
        {/* Brand - long-press the logo to reach admin sign-in (hidden from riders). */}
        <View className="items-center mb-10">
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={800}
            onLongPress={() => router.push('/admin-login')}
            accessibilityLabel="NR FleetHub"
          >
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: COLORS.primary }}
            >
              <Bike size={32} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={{ color: COLORS.textPrimary }} className="text-3xl font-black tracking-tight text-center">
            NR <Text style={{ color: COLORS.primary }}>FleetHub</Text>
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mt-1.5 text-center px-4">
            Sign in with your mobile number to start riding.
          </Text>
        </View>

        <View className="w-full max-w-[420px]">
          {busy === 'google' ? (
            <View className="items-center py-10">
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textSecondary }} className="font-medium mt-4">
                Opening Google sign-in...
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
                Mobile Number
              </Text>
              <View
                className="flex-row items-center rounded-2xl px-4 py-3.5 mb-1 border"
                style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
              >
                <Phone size={18} color={COLORS.textSecondary} />
                <TextInput
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t);
                    if (error) setError('');
                  }}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  accessibilityLabel="Mobile number"
                  className="flex-1 text-base font-semibold ml-3"
                  style={{ color: COLORS.textPrimary }}
                  onSubmitEditing={() => void sendCode()}
                />
              </View>
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-3 px-1">
                We&apos;ll text you a 6-digit code. Indian numbers can be typed without +91.
              </Text>

              {error ? (
                <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-3 px-1">
                  {error}
                </Text>
              ) : null}

              <TouchableOpacity
                onPress={() => void sendCode()}
                disabled={busy === 'otp'}
                accessibilityRole="button"
                style={{ backgroundColor: COLORS.primary, opacity: busy === 'otp' ? 0.7 : 1 }}
                className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
              >
                {busy === 'otp' ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Text className="text-white font-bold text-base mr-2">Send Code</Text>
                    <ArrowRight size={18} color="#FFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View className="flex-row items-center my-5">
                <View className="flex-1 h-px" style={{ backgroundColor: COLORS.border }} />
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold mx-3 uppercase">
                  or
                </Text>
                <View className="flex-1 h-px" style={{ backgroundColor: COLORS.border }} />
              </View>

              {/* Google - secondary / recovery */}
              <TouchableOpacity
                onPress={() => void continueWithGoogle()}
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                className="w-full py-3.5 rounded-2xl flex-row justify-center items-center border"
                style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
              >
                <View
                  className="w-5 h-5 rounded-full items-center justify-center mr-2.5"
                  style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border }}
                >
                  <Text style={{ color: '#4285F4' }} className="text-[13px] font-black">G</Text>
                </View>
                <Text style={{ color: COLORS.textPrimary }} className="font-bold text-sm">
                  Continue with Google
                </Text>
              </TouchableOpacity>
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2 text-center px-2">
                Changed your number? Use Google to get back into your account.
              </Text>

              {isMock ? (
                <View className="mt-8 pt-6 border-t" style={{ borderColor: COLORS.border }}>
                  <View className="flex-row items-center justify-center mb-3">
                    <Zap size={12} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning }} className="text-[11px] font-black uppercase tracking-wider ml-1.5">
                      Demo Mode - No Backend
                    </Text>
                  </View>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center mb-4 leading-relaxed">
                    OTP is faked (code 123456). Or tap a demo account to sign in instantly.
                  </Text>
                  <View style={{ gap: 8 }}>
                    {DEMO_ACCOUNTS.map((acct) => (
                      <TouchableOpacity
                        key={acct.email}
                        onPress={() => void demoLogin(acct.email)}
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
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center leading-relaxed">
                    By continuing you agree to our Terms and acknowledge our Privacy Policy.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
