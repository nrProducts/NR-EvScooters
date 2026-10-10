import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Spinner } from '../components/Spinner';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useAuthStore } from '../store/useAuthStore';
import { userRepository, referralRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { isValidPhone, toE164 } from '../lib/authValidation';
import { COLORS } from '../constants/theme';
import { FormField } from '../components/ui/FormField';
import { ChipSelect } from '../components/ui/ChipSelect';
import { DatePickerField } from '../components/ui/DatePickerField';
import { SearchableSelectField } from '../components/ui/SearchableSelectField';
import { INDIAN_STATES } from '../constants/indianStates';
import { User, Mail, Phone, ArrowRight, Gift, Check } from 'lucide-react-native';
import type { Gender } from '../types/api';
import { useT, type CopyKey } from '../i18n';
import { useReferralSummary } from '../hooks/useReferralSummary';

/** Keys, not labels — resolved with t() inside the component below. */
const GENDER_OPTION_KEYS: { key: Gender; labelKey: CopyKey }[] = [
  { key: 'male', labelKey: 'profileSetup.gender.male' },
  { key: 'female', labelKey: 'profileSetup.gender.female' },
  { key: 'other', labelKey: 'profileSetup.gender.other' },
  { key: 'prefer_not_to_say', labelKey: 'profileSetup.gender.preferNotToSay' },
];

/** YYYY-MM-DD, at least 18 years ago, not absurdly old. */
function isValidDob(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d >= new Date()) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age >= 18 && age <= 120;
}

/**
 * Shown right after a first-ever sign-in (phone or Google) when the account has
 * no name yet. Saving the profile clears the needs-profile state and the root
 * layout routes on to the KYC introduction.
 */
export default function ProfileSetupScreen() {
  const profile = useAuthStore((s) => s.profile);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { t } = useT();

  // The account already has exactly one identifier from sign-up (phone OTP
  // sets phone; Google sets email from the provider profile) — collect
  // whichever one is still missing instead of asking for both.
  const showPhoneField = !!profile?.email && !profile?.phone;
  const showEmailField = !showPhoneField;

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [dob, setDob] = useState(profile?.date_of_birth ?? '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [addressLine1, setAddressLine1] = useState(profile?.address_line_1 ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [state, setState] = useState(profile?.state ?? '');
  const [postalCode, setPostalCode] = useState(profile?.postal_code ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dobError, setDobError] = useState('');

  // Optional, and deliberately independent of the main Continue flow: a
  // rider must be able to finish profile setup with no code at all, and
  // applying one is its own backend call (referralRepository.redeem), not a
  // field saved alongside the profile.
  const { summary: referralSummary, reload: reloadReferral } = useReferralSummary();
  const [referralCode, setReferralCode] = useState('');
  const [referralApplying, setReferralApplying] = useState(false);
  const [referralError, setReferralError] = useState('');
  const myAttribution = referralSummary?.my_attribution ?? null;

  const applyReferralCode = async () => {
    const code = referralCode.trim().toUpperCase();
    if (code.length !== 6) {
      setReferralError(t('referrals.applyInvalidLength'));
      return;
    }
    setReferralError('');
    setReferralApplying(true);
    try {
      await referralRepository.redeem(code);
      setReferralCode('');
      await reloadReferral();
    } catch (err) {
      setReferralError(err instanceof ApiError ? err.message : t('referrals.applyFailed'));
    } finally {
      setReferralApplying(false);
    }
  };

  // Two independent "Next"-key chains, split around the DOB/Gender pickers
  // (which aren't text fields and can't be focused via the keyboard).
  const emailOrPhoneRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const postalCodeRef = useRef<TextInput>(null);

  const save = async () => {
    if (saving) return;

    if (fullName.trim().length < 2) {
      setError(t('profileSetup.error.fullName'));
      return;
    }
    if (!/^[A-Za-z\s'-]+$/.test(fullName.trim())) {
      setError(t('profileSetup.error.fullNameChars'));
      return;
    }
    if (showEmailField && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('profileSetup.error.email'));
      return;
    }
    if (showPhoneField && !isValidPhone(phone)) {
      setError(t('profileSetup.error.phone'));
      return;
    }
    if (!gender) {
      setError(t('profileSetup.error.gender'));
      return;
    }
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setError(t('profileSetup.error.address'));
      return;
    }
    if (!dob.trim() || !isValidDob(dob.trim())) {
      setDobError(t('profileSetup.error.dob'));
      return;
    }
    setError('');
    setDobError('');
    setSaving(true);
    try {
      await userRepository.updateMe({
        full_name: fullName.trim(),
        ...(showEmailField ? { email: email.trim().toLowerCase() } : {}),
        // Defaults a bare 10-digit Indian number to +91, same as the login screen.
        ...(showPhoneField ? { phone: toE164(phone) } : {}),
        date_of_birth: dob.trim(),
        gender: gender as Gender,
        address_line_1: addressLine1.trim(),
        city: city.trim(),
        state: state.trim(),
        postal_code: postalCode.trim(),
      });
      await refreshProfile();
      // Root layout routes onward once needs-profile clears.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('profileSetup.error.save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ flex: 1, backgroundColor: COLORS.background }}
      keyboardShouldPersistTaps="handled"
    >
        <View className="flex-1 px-6 pt-16 pb-16">
        <Text style={{ color: COLORS.textPrimary }} className="text-3xl font-black mb-2">
          {t('profileSetup.title')}
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mb-8">
          {t('profileSetup.subtitle')}
        </Text>

        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
          {t('profileSetup.fullName')} <Text style={{ color: COLORS.danger }}>*</Text>
        </Text>
        <View
          className="flex-row items-center rounded-2xl px-4 py-3.5 mb-4 border"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <User size={18} color={COLORS.textSecondary} />
          <TextInput
            value={fullName}
            onChangeText={(v) => {
              setFullName(v);
              if (error) setError('');
            }}
            placeholder={t('profileSetup.fullNamePlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="words"
            autoComplete="name"
            accessibilityLabel={t('profileSetup.fullName')}
            className="flex-1 text-base font-semibold ml-3"
            style={{ color: COLORS.textPrimary }}
            returnKeyType="next"
            onSubmitEditing={() => emailOrPhoneRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        {showEmailField ? (
          <>
            <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
              {t('profileSetup.email')} <Text style={{ color: COLORS.danger }}>*</Text>
            </Text>
            <View
              className="flex-row items-center rounded-2xl px-4 py-3.5 mb-5 border"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <Mail size={18} color={COLORS.textSecondary} />
              <TextInput
                ref={emailOrPhoneRef}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError('');
                }}
                placeholder={t('profileSetup.emailPlaceholder')}
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel={t('profileSetup.email')}
                className="flex-1 text-base font-semibold ml-3"
                style={{ color: COLORS.textPrimary }}
                returnKeyType="done"
              />
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
              {t('profileSetup.phone')} <Text style={{ color: COLORS.danger }}>*</Text>
            </Text>
            <View
              className="flex-row items-center rounded-2xl px-4 py-3.5 mb-1 border"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <Phone size={18} color={COLORS.textSecondary} />
              <TextInput
                ref={emailOrPhoneRef}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (error) setError('');
                }}
                placeholder={t('profileSetup.phonePlaceholder')}
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
                autoComplete="tel"
                accessibilityLabel={t('profileSetup.phone')}
                className="flex-1 text-base font-semibold ml-3"
                style={{ color: COLORS.textPrimary }}
                returnKeyType="done"
              />
            </View>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-4 px-1">
              {t('profileSetup.phoneHint')}
            </Text>
          </>
        )}

        <DatePickerField
          label={t('profileSetup.dob')}
          required
          value={dob}
          onChangeText={(v) => {
            setDob(v);
            if (dobError) setDobError('');
          }}
          hint={t('profileSetup.dobHint')}
          error={dobError}
        />

        <ChipSelect
          label={t('profileSetup.gender')}
          required
          options={GENDER_OPTION_KEYS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
          value={gender}
          onChange={(v) => setGender(v)}
        />

        <FormField
          ref={addressRef}
          label={t('profileSetup.address')}
          required
          value={addressLine1}
          onChangeText={setAddressLine1}
          placeholder={t('profileSetup.addressPlaceholder')}
          returnKeyType="next"
          onSubmitEditing={() => cityRef.current?.focus()}
          autoComplete="street-address"
        />
        <View className="flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <FormField
              ref={cityRef}
              label={t('profileSetup.city')}
              required
              value={city}
              onChangeText={setCity}
              placeholder={t('profileSetup.cityPlaceholder')}
              returnKeyType="next"
              onSubmitEditing={() => postalCodeRef.current?.focus()}
              // No RN-cross-platform token maps to "city" specifically (see
              // the allowed list on TextInput.autoComplete) — 'off' beats
              // leaving it unset, since unset silently becomes RNW's 'on'
              // default and reopens the same ambiguous-autofill exposure.
              autoComplete="off"
            />
          </View>
          <View className="flex-1">
            <SearchableSelectField
              label={t('profileSetup.state')}
              required
              options={INDIAN_STATES}
              value={state}
              onChange={setState}
              placeholder={t('profileSetup.statePlaceholder')}
            />
          </View>
        </View>
        <FormField
          ref={postalCodeRef}
          label={t('profileSetup.postalCode')}
          required
          value={postalCode}
          onChangeText={setPostalCode}
          placeholder={t('profileSetup.postalCodePlaceholder')}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          autoComplete="postal-code"
        />

        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
          {t('profileSetup.referralCode')}
        </Text>
        {myAttribution ? (
          <View
            className="flex-row items-center rounded-2xl px-4 py-3.5 mb-4 border"
            style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, gap: 10 }}
          >
            <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: COLORS.primary + '14' }}>
              <Check size={16} color={COLORS.primary} />
            </View>
            <Text style={{ color: COLORS.textPrimary }} className="text-[13px] font-semibold flex-1">
              {t('referrals.referredBy', { name: myAttribution.referrer_display_name })}
            </Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center mb-4" style={{ gap: 8 }}>
              <View
                className="flex-1 flex-row items-center rounded-2xl px-4 py-3.5 border"
                style={{ backgroundColor: COLORS.card, borderColor: referralError ? COLORS.danger : COLORS.border }}
              >
                <Gift size={18} color={COLORS.textSecondary} />
                <TextInput
                  value={referralCode}
                  onChangeText={(v) => {
                    setReferralCode(v.toUpperCase().slice(0, 6));
                    if (referralError) setReferralError('');
                  }}
                  placeholder={t('profileSetup.referralCodePlaceholder')}
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  accessibilityLabel={t('profileSetup.referralCode')}
                  className="flex-1 text-base font-semibold ml-3"
                  style={{ color: COLORS.textPrimary, letterSpacing: 2 }}
                />
              </View>
              <TouchableOpacity
                onPress={() => void applyReferralCode()}
                disabled={referralApplying || referralCode.trim().length !== 6}
                accessibilityRole="button"
                className="rounded-2xl px-4 items-center justify-center"
                style={{
                  backgroundColor: COLORS.primary, height: 52,
                  opacity: referralApplying || referralCode.trim().length !== 6 ? 0.5 : 1,
                }}
              >
                {referralApplying
                  ? <Spinner size={16} color="#FFF" />
                  : <Text className="text-white text-xs font-extrabold">{t('referrals.apply')}</Text>}
              </TouchableOpacity>
            </View>
            {referralError ? (
              <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-4 px-1 -mt-3">
                {referralError}
              </Text>
            ) : null}
          </>
        )}

        {error ? (
          <Text style={{ color: COLORS.danger }} className="text-xs font-semibold mb-4 px-1">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.primary, opacity: saving ? 0.7 : 1 }}
          className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm mt-2"
        >
          {saving ? (
            <Spinner size={18} color="#FFF" />
          ) : (
            <>
              <Text className="text-white font-bold text-base mr-2">{t('common.continue')}</Text>
              <ArrowRight size={18} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
        </View>
    </KeyboardAwareScrollView>
  );
}
