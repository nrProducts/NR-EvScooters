import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Spinner } from '../components/Spinner';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useAuthStore } from '../store/useAuthStore';
import { userRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import { isValidPhone, toE164 } from '../lib/authValidation';
import { COLORS } from '../constants/theme';
import { FormField } from '../components/ui/FormField';
import { ChipSelect } from '../components/ui/ChipSelect';
import { DatePickerField } from '../components/ui/DatePickerField';
import { SearchableSelectField } from '../components/ui/SearchableSelectField';
import { INDIAN_STATES } from '../constants/indianStates';
import { User, Mail, Phone, ArrowRight } from 'lucide-react-native';
import type { Gender } from '../types/api';

const GENDER_OPTIONS = [
  { key: 'male' as const, label: 'Male' },
  { key: 'female' as const, label: 'Female' },
  { key: 'other' as const, label: 'Other' },
  { key: 'prefer_not_to_say' as const, label: 'Prefer not to say' },
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

  // Two independent "Next"-key chains, split around the DOB/Gender pickers
  // (which aren't text fields and can't be focused via the keyboard).
  const emailOrPhoneRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const postalCodeRef = useRef<TextInput>(null);

  const save = async () => {
    if (saving) return;

    if (fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (!/^[A-Za-z\s'-]+$/.test(fullName.trim())) {
      setError('Full name can only contain letters, spaces, apostrophes and hyphens.');
      return;
    }
    if (showEmailField && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (showPhoneField && !isValidPhone(phone)) {
      setError('Enter a valid phone number, e.g. 98765 43210.');
      return;
    }
    if (!gender) {
      setError('Select a gender.');
      return;
    }
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      setError('Fill in your full address.');
      return;
    }
    if (!dob.trim() || !isValidDob(dob.trim())) {
      setDobError('Use YYYY-MM-DD; you must be at least 18.');
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
      setError(err instanceof ApiError ? err.message : 'Could not save your profile. Please try again.');
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
          Complete your profile and get ready to ride.
        </Text>
        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-medium mb-8">
          A few details so we can set your account up properly. You can always update these later.
        </Text>

        <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
          Full Name <Text style={{ color: COLORS.danger }}>*</Text>
        </Text>
        <View
          className="flex-row items-center rounded-2xl px-4 py-3.5 mb-4 border"
          style={{ backgroundColor: COLORS.card, borderColor: error ? COLORS.danger : COLORS.border }}
        >
          <User size={18} color={COLORS.textSecondary} />
          <TextInput
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              if (error) setError('');
            }}
            placeholder="Your name"
            placeholderTextColor={COLORS.textSecondary}
            autoCapitalize="words"
            accessibilityLabel="Full name"
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
              Email <Text style={{ color: COLORS.danger }}>*</Text>
            </Text>
            <View
              className="flex-row items-center rounded-2xl px-4 py-3.5 mb-5 border"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <Mail size={18} color={COLORS.textSecondary} />
              <TextInput
                ref={emailOrPhoneRef}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError('');
                }}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel="Email address"
                className="flex-1 text-base font-semibold ml-3"
                style={{ color: COLORS.textPrimary }}
                returnKeyType="done"
              />
            </View>
          </>
        ) : (
          <>
            <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold mb-2">
              Phone <Text style={{ color: COLORS.danger }}>*</Text>
            </Text>
            <View
              className="flex-row items-center rounded-2xl px-4 py-3.5 mb-1 border"
              style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
            >
              <Phone size={18} color={COLORS.textSecondary} />
              <TextInput
                ref={emailOrPhoneRef}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (error) setError('');
                }}
                placeholder="98765 43210"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
                autoComplete="tel"
                accessibilityLabel="Phone number"
                className="flex-1 text-base font-semibold ml-3"
                style={{ color: COLORS.textPrimary }}
                returnKeyType="done"
              />
            </View>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mb-4 px-1">
              Indian numbers can be typed without +91.
            </Text>
          </>
        )}

        <DatePickerField
          label="Date of Birth"
          required
          value={dob}
          onChangeText={(t) => {
            setDob(t);
            if (dobError) setDobError('');
          }}
          hint="You must be at least 18 to ride."
          error={dobError}
        />

        <ChipSelect
          label="Gender"
          required
          options={GENDER_OPTIONS}
          value={gender}
          onChange={(v) => setGender(v)}
        />

        <FormField
          ref={addressRef}
          label="Address"
          required
          value={addressLine1}
          onChangeText={setAddressLine1}
          placeholder="House / street / area"
          returnKeyType="next"
          onSubmitEditing={() => cityRef.current?.focus()}
        />
        <View className="flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <FormField
              ref={cityRef}
              label="City"
              required
              value={city}
              onChangeText={setCity}
              placeholder="City"
              returnKeyType="next"
              onSubmitEditing={() => postalCodeRef.current?.focus()}
            />
          </View>
          <View className="flex-1">
            <SearchableSelectField
              label="State"
              required
              options={INDIAN_STATES}
              value={state}
              onChange={setState}
              placeholder="Select state"
            />
          </View>
        </View>
        <FormField
          ref={postalCodeRef}
          label="Postal Code"
          required
          value={postalCode}
          onChangeText={setPostalCode}
          placeholder="PIN code"
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />

        {/*
          The Referral Code field was here.
          Referrals are not part of the current database schema — `referrals`,
          `referral_rewards` and `users.referral_code` have no successor, and
          the backend module is a documented stub that refuses every call (see
          apps/backend/src/modules/referrals/referrals.service.ts). Asking for
          a code that can only ever come back "invalid or expired" is worse
          than not asking, so the field is gone until referrals have a schema
          again. See docs/final-system-audit (finding M5).
        */}

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
              <Text className="text-white font-bold text-base mr-2">Continue</Text>
              <ArrowRight size={18} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
        </View>
    </KeyboardAwareScrollView>
  );
}
