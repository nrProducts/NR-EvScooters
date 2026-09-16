import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { formatPhoneForDisplay, isValidOtp, sanitizeOtpInput } from '../lib/authValidation';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { Spinner } from '../components/Spinner';
import { useT } from '../i18n';

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
  const { t } = useT();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  // Focus once the screen actually holds navigation focus, not on a fixed
  // timer. A bare setTimeout raced the push animation: on a slower device the
  // focus landed mid-transition, React marked the input focused but Android
  // never raised the soft keyboard — and since the input then already HAD
  // focus, tapping the boxes called focus() again as a no-op, leaving no way
  // to recover short of backgrounding the app. blur() first so the focus is a
  // real transition even if RN still believes the field is focused.
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        inputRef.current?.blur();
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(t);
    }, []),
  );

  const submit = async (value: string = code) => {
    if (verifying) return;
    if (!isValidOtp(value)) {
      setError(t('otp.error.invalid'));
      return;
    }
    setError('');
    setVerifying(true);
    try {
      await verifyOtp(phone, value);
      // Root layout redirects from here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('otp.error.verifyFailed'));
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
      setError(err instanceof ApiError ? err.message : t('otp.error.resendFailed'));
    }
  };

  const digits = code.padEnd(6, ' ').split('');

  return (
    <View className="flex-1 px-6 pt-16" style={{ backgroundColor: COLORS.background }}>
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('auth.goBack')}
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
        {t('otp.title')}
      </Text>
      <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mb-8">
        {t('otp.sentTo', { phone: phone ? formatPhoneForDisplay(phone) : t('otp.yourNumber') })}
      </Text>

      {/* The boxes are decoration; the input below is the real field, stretched
          over them so a tap lands on the input ITSELF and Android raises the
          keyboard the way it does for any ordinary field. Previously the input
          was 1x1 and fully transparent in the corner, so it could never be
          tapped — the only way in was a programmatic focus(), and when that
          silently failed to raise the keyboard there was no way to recover. */}
      <View className="mb-6">
        <View className="flex-row justify-between">
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
          caretHidden
          accessibilityLabel={t('otp.inputLabel')}
          // Transparent text over the boxes, not an invisible view: Android
          // will not raise the keyboard for a zero-opacity field, so the field
          // stays barely-rendered while its own text and caret are hidden.
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.01,
            color: 'transparent',
          }}
        />
      </View>

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
          <Spinner size={18} color="#FFF" />
        ) : (
          <Text className="text-white font-bold text-base">{t('otp.verify')}</Text>
        )}
      </TouchableOpacity>

      <View className="flex-row justify-center mt-6">
        {secondsLeft > 0 ? (
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
            {t('otp.resendIn', { seconds: secondsLeft })}
          </Text>
        ) : (
          <TouchableOpacity onPress={() => void resend()} accessibilityRole="button">
            <Text style={{ color: COLORS.primary }} className="text-xs font-bold">
              {t('otp.resend')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
