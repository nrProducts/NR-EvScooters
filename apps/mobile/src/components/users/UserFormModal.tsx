import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { FormField } from '../ui/FormField';
import { ChipSelect } from '../ui/ChipSelect';
import { COLORS } from '../../constants/theme';
import { ApiError } from '../../lib/ApiError';
import type {
  AccountStatus, ApiUserDetail, CreateUserPayload, Gender, RoleName, UpdateUserPayload,
} from '../../types/api';

interface FormState {
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: Gender;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  role: RoleName;
  account_status: AccountStatus;
}

const EMPTY: FormState = {
  full_name: '', email: '', phone: '', date_of_birth: '', gender: 'prefer_not_to_say',
  address_line_1: '', address_line_2: '', city: '', state: '', postal_code: '', country: 'IN',
  emergency_contact_name: '', emergency_contact_phone: '',
  role: 'rider', account_status: 'active',
};

const GENDER_OPTIONS = [
  { key: 'male' as const, label: 'Male' },
  { key: 'female' as const, label: 'Female' },
  { key: 'other' as const, label: 'Other' },
  { key: 'prefer_not_to_say' as const, label: 'Prefer not to say' },
];

const ROLE_OPTIONS = [
  { key: 'rider' as const, label: 'Rider' },
  { key: 'staff' as const, label: 'Staff' },
  { key: 'technician' as const, label: 'Technician' },
  { key: 'station_manager' as const, label: 'Station Manager' },
  { key: 'admin' as const, label: 'Admin' },
];

const STATUS_OPTIONS = [
  { key: 'active' as const, label: 'Active' },
  { key: 'inactive' as const, label: 'Inactive' },
];

interface Props {
  visible: boolean;
  /** null = create mode; a user = edit mode. */
  editing: ApiUserDetail | null;
  /** Hides role/account fields for a rider editing their own profile (§8). */
  selfService?: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (user: ApiUserDetail) => void;
  /**
   * Injected by the parent, which owns the repository. Resolves with an
   * ApiError rather than throwing, so field errors can be mapped without a
   * try/catch here. Keeping this a prop is what stops the modal reaching for
   * the network itself.
   */
  onCreate: (payload: CreateUserPayload) => Promise<ApiUserDetail | ApiError>;
  onUpdate: (id: string, patch: UpdateUserPayload) => Promise<ApiUserDetail | ApiError>;
}

/**
 * One component, both modes. Field-level errors come from two places: cheap
 * local checks that run before we spend a round trip, and the API's
 * `error.fields` map, which is merged in on 400/409/422 so server rules
 * (duplicate email, age limits) land on the right input.
 */
export const UserFormModal: React.FC<Props> = ({
  visible, editing, selfService, isAdmin, onClose, onSaved, onCreate, onUpdate,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [initial, setInitial] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const next: FormState = editing
      ? {
          full_name: editing.full_name ?? '',
          email: editing.email ?? '',
          phone: editing.phone ?? '',
          date_of_birth: editing.date_of_birth ?? '',
          gender: (editing.gender as Gender) ?? 'prefer_not_to_say',
          address_line_1: editing.address_line_1 ?? '',
          address_line_2: editing.address_line_2 ?? '',
          city: editing.city ?? '',
          state: editing.state ?? '',
          postal_code: editing.postal_code ?? '',
          country: editing.country ?? 'IN',
          emergency_contact_name: editing.emergency_contact_name ?? '',
          emergency_contact_phone: editing.emergency_contact_phone ?? '',
          role: editing.roles[0] ?? 'rider',
          account_status: editing.account_status,
        }
      : EMPTY;
    setForm(next);
    setInitial(next);
    setErrors({});
    setBanner(null);
  }, [visible, editing]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Clearing on edit stops a stale server error sitting under a fixed field.
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  /** Cheap pre-flight checks. The backend re-validates everything regardless. */
  const validateLocally = (): boolean => {
    const next: Record<string, string> = {};

    if (form.full_name.trim().length < 2) next.full_name = "Enter the rider's full name.";
    if (!editing && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(form.phone.replace(/[\s()-]/g, ''))) {
      next.phone = 'Enter a valid phone number, e.g. +919876543210.';
    }
    if (form.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) {
      next.date_of_birth = 'Use the format YYYY-MM-DD.';
    }
    if (
      form.emergency_contact_phone &&
      !/^\+?[1-9]\d{7,14}$/.test(form.emergency_contact_phone.replace(/[\s()-]/g, ''))
    ) {
      next.emergency_contact_phone = 'Enter a valid phone number.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): CreateUserPayload => {
    const trimmed = (v: string) => (v.trim() === '' ? undefined : v.trim());
    return {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      date_of_birth: trimmed(form.date_of_birth),
      gender: form.gender,
      address_line_1: trimmed(form.address_line_1),
      address_line_2: trimmed(form.address_line_2),
      city: trimmed(form.city),
      state: trimmed(form.state),
      postal_code: trimmed(form.postal_code),
      country: trimmed(form.country),
      emergency_contact_name: trimmed(form.emergency_contact_name),
      emergency_contact_phone: trimmed(form.emergency_contact_phone),
      role: form.role,
      account_status: form.account_status,
    };
  };

  const handleSubmit = async () => {
    if (submitting) return; // guard against a double tap firing two creates
    if (!validateLocally()) return;

    setSubmitting(true);
    setBanner(null);

    const payload = buildPayload();
    let result: ApiUserDetail | ApiError;

    if (editing) {
      // role / account_status have their own endpoints and audit records, so
      // they are stripped from a plain profile update. Email is immutable here.
      const { role: _role, account_status: _status, email: _email, ...patch } = payload;
      result = await onUpdate(editing.id, patch);
    } else {
      result = await onCreate(payload);
    }

    setSubmitting(false);

    if (result instanceof ApiError) {
      if (result.fields) setErrors(result.fields);
      setBanner(result.message);
      return;
    }

    onSaved(result);
    onClose();
  };

  const requestClose = () => {
    if (submitting) return;
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this profile will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  };

  const showAccountSection = !selfService && isAdmin;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={requestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}
      >
        <View
          style={{
            backgroundColor: COLORS.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '90%',
          }}
        >
          <View className="flex-row justify-between items-center px-6 pt-6 pb-4">
            <Text style={{ color: COLORS.textPrimary }} className="text-lg font-black">
              {editing ? (selfService ? 'Edit My Profile' : 'Edit User') : 'Add User'}
            </Text>
            <TouchableOpacity
              onPress={requestClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: COLORS.background }}
            >
              <X size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {banner ? (
            <View
              className="mx-6 mb-3 px-3.5 py-2.5 rounded-xl"
              style={{ backgroundColor: COLORS.danger + '10' }}
            >
              <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold">
                {banner}
              </Text>
            </View>
          ) : null}

          <ScrollView
            className="px-6"
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <SectionLabel>Personal Information</SectionLabel>
            <FormField
              label="Full Name" required value={form.full_name}
              onChangeText={(t) => set('full_name', t)}
              placeholder="e.g. Asha Menon" error={errors.full_name}
            />
            <FormField
              label="Email" required value={form.email}
              onChangeText={(t) => set('email', t)}
              placeholder="you@example.com" keyboardType="email-address"
              autoCapitalize="none" error={errors.email}
              editable={!editing}
              hint={editing ? 'Email changes go through account recovery.' : undefined}
            />
            <FormField
              label="Phone" required value={form.phone}
              onChangeText={(t) => set('phone', t)}
              placeholder="+919876543210" keyboardType="phone-pad" error={errors.phone}
            />
            <FormField
              label="Date of Birth" value={form.date_of_birth}
              onChangeText={(t) => set('date_of_birth', t)}
              placeholder="YYYY-MM-DD" error={errors.date_of_birth}
              hint="Riders must be 18 or older."
            />
            <ChipSelect
              label="Gender" options={GENDER_OPTIONS} value={form.gender}
              onChange={(v) => set('gender', v)} error={errors.gender}
            />

            <SectionLabel>Address</SectionLabel>
            <FormField
              label="Address Line 1" value={form.address_line_1}
              onChangeText={(t) => set('address_line_1', t)}
              placeholder="Flat / street" error={errors.address_line_1}
            />
            <FormField
              label="Address Line 2" value={form.address_line_2}
              onChangeText={(t) => set('address_line_2', t)}
              placeholder="Area / landmark" error={errors.address_line_2}
            />
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <FormField
                  label="City" value={form.city}
                  onChangeText={(t) => set('city', t)} placeholder="Kochi" error={errors.city}
                />
              </View>
              <View className="flex-1">
                <FormField
                  label="State" value={form.state}
                  onChangeText={(t) => set('state', t)} placeholder="Kerala" error={errors.state}
                />
              </View>
            </View>
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <FormField
                  label="Postal Code" value={form.postal_code}
                  onChangeText={(t) => set('postal_code', t)}
                  placeholder="682001" error={errors.postal_code}
                />
              </View>
              <View className="flex-1">
                <FormField
                  label="Country" value={form.country}
                  onChangeText={(t) => set('country', t.toUpperCase())}
                  placeholder="IN" autoCapitalize="characters" error={errors.country}
                  hint="2-letter code"
                />
              </View>
            </View>

            <SectionLabel>Emergency Contact</SectionLabel>
            <FormField
              label="Contact Name" value={form.emergency_contact_name}
              onChangeText={(t) => set('emergency_contact_name', t)}
              placeholder="e.g. Ravi Menon" error={errors.emergency_contact_name}
            />
            <FormField
              label="Contact Phone" value={form.emergency_contact_phone}
              onChangeText={(t) => set('emergency_contact_phone', t)}
              placeholder="+919876543211" keyboardType="phone-pad"
              error={errors.emergency_contact_phone}
            />

            {showAccountSection ? (
              <>
                <SectionLabel>Account Configuration</SectionLabel>
                {editing ? (
                  <View
                    className="rounded-xl px-3.5 py-3 border mb-3.5"
                    style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
                  >
                    <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                      Role and account status have their own actions on the user card, so
                      they are always written with an audit record.
                    </Text>
                  </View>
                ) : (
                  <>
                    <ChipSelect
                      label="Role" required options={ROLE_OPTIONS} value={form.role}
                      onChange={(v) => set('role', v)} error={errors.role}
                    />
                    <ChipSelect
                      label="Account Status" required options={STATUS_OPTIONS}
                      value={form.account_status}
                      onChange={(v) => set('account_status', v)}
                      error={errors.account_status}
                    />
                    <View
                      className="rounded-xl px-3.5 py-3 border mb-2"
                      style={{ backgroundColor: COLORS.primary + '0A', borderColor: COLORS.primary + '33' }}
                    >
                      <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                        No password is set here. The rider gets an invitation email and
                        chooses their own.
                      </Text>
                    </View>
                  </>
                )}
              </>
            ) : null}
          </ScrollView>

          <View className="px-6 pt-2" style={{ paddingBottom: Platform.OS === 'ios' ? 34 : 20 }}>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitting }}
              className="w-full py-4 rounded-2xl flex-row justify-center items-center"
              style={{ backgroundColor: submitting ? COLORS.gray[300] : COLORS.primary }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Check size={16} color="#FFF" />
                  <Text className="text-white font-bold text-sm ml-2">
                    {editing ? 'Save Changes' : 'Send Invite & Create'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const SectionLabel: React.FC<{ children: string }> = ({ children }) => (
  <Text
    style={{ color: COLORS.textPrimary }}
    className="text-xs font-black uppercase tracking-wider mb-3 mt-2"
  >
    {children}
  </Text>
);
