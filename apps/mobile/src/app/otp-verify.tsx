import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { formatPhoneForDisplay, isValidOtp, sanitizeOtpInput } from '../lib/authValidation';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';

const RESEND_SECONDS = 30;

/**
 * Enter the 6-digit code. The number arrives as a param from the login screen,
 * which already requested the OTP. Verifying establishes the session; the root
 * layout then routes to profile-setup (new account) or home.
 */
export default function OtpVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = typeof params.phone === 'string' ? params.phone : '';

  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const requestOtp = useAuthStore((s) => s.requestOtp);

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const submit = async (value: string = code) => {
    if (verifying) return;
    if (!isValidOtp(value)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError('');
    setVerifying(true);
    try {
      await verifyOtp(phone, value);
      // Root layout redirects from here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify the code. Please try again.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (secondsLeft > 0) return;
    setError('');
    try {
      await requestOtp(phone);
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    }
  };

  const digits = code.padEnd(6, ' ').split('');

  return (
    <View className="flex-1 px-6 pt-16" style={{ backgroundColor: COLORS.background }}>
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="w-10 h-10 rounded-2xl items-center justify-center mb-8 border"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
      >
        <ArrowLeft size={20} color={COLORS.textPrimary} />
      </TouchableOpacity>

      <View
        className="w-14 h-14 rounded-3xl items-center justify-center mb-5"
        style={{ backgroundColor: COLORS.primary + '18' }}
      >
        <ShieldCheck size={26} color={COLORS.primary} />
      </View>

      <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mb-2">
        Enter verification code
      </Text>
      <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mb-8">
        Sent to {phone ? formatPhoneForDisplay(phone) : 'your number'}.
      </Text>

      {/* Hidden real input; the boxes below mirror it. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => {
          const next = sanitizeOtpInput(t);
          setCode(next);
          if (error) setError('');
          if (next.length === 6) void submit(next);
        }}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        accessibilityLabel="6 digit verification code"
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />

      <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()}>
        <View className="flex-row justify-between mb-6">
          {digits.map((d, i) => {
            const active = i === code.length;
            return (
              <View
                key={i}
                className="rounded-2xl items-center justify-center border"
                style={{
                  width: 48,
                  height: 58,
                  backgroundColor: COLORS.card,
                  borderColor: error ? COLORS.danger : active ? COLORS.primary : COLORS.border,
                  borderWidth: active ? 2 : 1,
                }}
              >
                <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black">
                  {d.trim()}
                </Text>
              </View>
            );
          })}
        </View>
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-4 px-1">
          {error}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => void submit()}
        disabled={verifying}
        accessibilityRole="button"
        style={{ backgroundColor: COLORS.primary, opacity: verifying ? 0.7 : 1 }}
        className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
      >
        {verifying ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text className="text-white font-bold text-base">Verify</Text>
        )}
      </TouchableOpacity>

      <View className="flex-row justify-center mt-6">
        {secondsLeft > 0 ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
            Resend code in {secondsLeft}s
          </Text>
        ) : (
          <TouchableOpacity onPress={() => void resend()} accessibilityRole="button">
            <Text style={{ color: COLORS.primary }} className="text-xs font-bold">
              Resend code
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
