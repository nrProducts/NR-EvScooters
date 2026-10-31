import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Keyboard } from 'react-native';
import { Spinner } from '../components/Spinner';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import { isValidPhone, sanitizePhoneInput, toE164 } from '../lib/authValidation';
import { Phone, ArrowRight } from 'lucide-react-native';
import { useT } from '../i18n';
import { GradientFill } from '../components/ui/GradientFill';

/**
 * Rider login = phone + OTP. Google is offered as a secondary / recovery
 * method. There is no staff sign-in here: the admin console is apps/web, and
 * this app is rider-only.
 */
export default function LoginScreen() {
  const router = useRouter();
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const { t } = useT();

  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<'otp' | 'google' | null>(null);
  const [error, setError] = useState('');

  const sendCode = async () => {
    if (busy) return;
    if (!isValidPhone(phone)) {
      setError(t('auth.error.invalidPhone'));
      return;
    }
    const e164 = toE164(phone);
    setError('');
    setBusy('otp');
    // Same reason as otp-verify.tsx: the phone pad hides the button's spinner.
    Keyboard.dismiss();
    try {
      await requestOtp(e164);
      router.push({ pathname: '/otp-verify', params: { phone: e164 } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.error.sendFailed'));
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
      setError(err instanceof ApiError ? err.message : t('auth.error.googleFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ flex: 1, backgroundColor: COLORS.background }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-1">
        {/* A green band with the white wordmark; the sign-in card floats over its lower edge. */}
        <View
          className="items-center px-6 pt-20"
          style={{
            backgroundColor: COLORS.primary, paddingBottom: 96, overflow: 'hidden',
            borderBottomLeftRadius: 44, borderBottomRightRadius: 44,
          }}
        >
          <GradientFill />
          {/* Two soft discs for depth. */}
          <View style={{ position: 'absolute', right: -70, top: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.10)' }} />
          <View style={{ position: 'absolute', left: -90, bottom: -110, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <Image
            source={require('../../assets/images/logo-wordmark.png')}
            accessibilityLabel="Swapngo"
            // The wordmark has dark lettering; tintColor makes the whole thing white on the green.
            // Explicit style, not className — sizing an <Image> via NativeWind
            // className doesn't reliably constrain it on web (the static export
            // renders it at the asset's intrinsic pixel size instead).
            style={{ width: 190, height: 36, tintColor: '#FFFFFF', marginBottom: 14 }}
            resizeMode="contain"
          />
          <Text style={{ color: 'rgba(255,255,255,0.92)' }} className="text-sm font-medium text-center px-6">
            {t('auth.tagline')}
          </Text>
        </View>

        <View className="px-5 pb-10 items-center" style={{ marginTop: -60 }}>
          <View className="w-full max-w-[420px]">
            {/* The form card */}
            <View
              className="rounded-[28px] px-5 pt-6 pb-5"
              style={{
                backgroundColor: COLORS.card,
                shadowColor: '#101828', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 8,
              }}
            >
              {busy === 'google' ? (
                <View className="items-center py-10">
                  <Spinner size={32} color={COLORS.primary} />
                  <Text style={{ color: COLORS.textSecondary }} className="font-medium mt-4">
                    {t('auth.openingGoogle')}
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: COLORS.textPrimary }} className="text-xl font-bold mb-3">
                    {t('auth.signIn')}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary }} className="text-sm font-semibold mb-2">
                    {t('auth.mobileNumber')}
                  </Text>
                  <View
                    className="flex-row items-center rounded-2xl px-4 py-3.5 mb-1 border"
                    style={{ backgroundColor: COLORS.background, borderColor: error ? COLORS.danger : COLORS.border }}
                  >
                    <Phone size={18} color={COLORS.textSecondary} />
                    <TextInput
                      value={phone}
                      onChangeText={(t) => {
                        setPhone(sanitizePhoneInput(t));
                        if (error) setError('');
                      }}
                      placeholder={t('auth.mobileNumberPlaceholder')}
                      placeholderTextColor={COLORS.textSecondary}
                      keyboardType="phone-pad"
                      maxLength={13}
                      autoComplete="tel"
                      accessibilityLabel={t('auth.mobileNumberPlaceholder')}
                      className="flex-1 text-base font-medium ml-3"
                      style={{ color: COLORS.textPrimary }}
                      onSubmitEditing={() => void sendCode()}
                    />
                  </View>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-3 px-1">
                    {t('auth.otpHint')}
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
                    style={{ backgroundColor: COLORS.primary, overflow: 'hidden', opacity: busy === 'otp' ? 0.7 : 1 }}
                    className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
                  >
                    <GradientFill />
                    {busy === 'otp' ? (
                      <Spinner size={18} color="#FFF" />
                    ) : (
                      <>
                        <Text className="text-white font-bold text-base mr-2">{t('auth.sendCode')}</Text>
                        <ArrowRight size={18} color="#FFF" />
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {busy !== 'google' && (
              <>
                {/* Divider */}
                <View className="flex-row items-center my-5">
                  <View className="flex-1 h-px" style={{ backgroundColor: COLORS.border }} />
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold mx-3 uppercase">
                    {t('auth.or')}
                  </Text>
                  <View className="flex-1 h-px" style={{ backgroundColor: COLORS.border }} />
                </View>

                {/* Google - secondary / recovery */}
                <TouchableOpacity
                  onPress={() => void continueWithGoogle()}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.continueWithGoogle')}
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
                    {t('auth.continueWithGoogle')}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-2 text-center px-2">
                  {t('auth.googleRecoveryHint')}
                </Text>

                <View className="mt-8 pt-6 border-t" style={{ borderColor: COLORS.border }}>
                  <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium text-center leading-relaxed">
                    {t('auth.legalNote')}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}
