import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserPlus, Info } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { FormField } from '../../components/ui/FormField';
import { ErrorState } from '../../components/ui/ErrorState';
import { confirmAction, notify } from '../../lib/confirm';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import type { ApiNominee } from '../../types/api';

/**
 * Nomination (DPDPA s.14): someone who may exercise the rider's rights if
 * they die or become unable to act.
 *
 * The form asks for a name, a relationship and ONE contact channel and
 * nothing else. This is a third party's personal data, handed to us by
 * someone who is not them — an address or date of birth would be collection
 * with no purpose behind it, and the rider is told to let them know.
 */
export default function NomineeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useT();

    const [nominee, setNominee] = useState<ApiNominee | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const [fullName, setFullName] = useState('');
    const [relationship, setRelationship] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    const load = React.useCallback(async () => {
        setLoadError(null);
        try {
            const current = await api.myNominee();
            setNominee(current);
            setFullName(current.full_name ?? '');
            setRelationship(current.relationship ?? '');
            setPhone(current.phone ?? '');
            setEmail(current.email ?? '');
        } catch (err) {
            setLoadError(err instanceof ApiError ? err.message : 'Could not load your nominee.');
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const save = async () => {
        setSaving(true);
        setFieldErrors({});
        try {
            const saved = await api.updateNominee({
                full_name: fullName.trim(),
                relationship: relationship.trim(),
                phone: phone.trim() || undefined,
                email: email.trim() || undefined,
            });
            setNominee(saved);
            notify('Nominee saved', t('privacy.nominee.warn'));
            router.back();
        } catch (err) {
            if (err instanceof ApiError) {
                setFieldErrors(err.fields ?? {});
                if (!err.fields) notify('Could not save', err.message);
            } else {
                notify('Could not save', 'Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        const confirmed = await confirmAction({
            title: 'Remove your nominee?',
            message: 'Nobody will be able to act on your behalf until you name someone else.',
            confirmLabel: 'Remove',
            cancelLabel: t('common.cancel'),
            destructive: true,
        });
        if (!confirmed) return;

        setSaving(true);
        try {
            await api.deleteNominee();
            notify('Nominee removed', '');
            router.back();
        } catch (err) {
            notify('Could not remove', err instanceof ApiError ? err.message : 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const canSave =
        fullName.trim().length >= 2 &&
        relationship.trim().length >= 2 &&
        (phone.trim().length > 0 || email.trim().length > 0);

    return (
        <AppShell title={t('privacy.nominee.heading')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                {loadError ? (
                    <ErrorState message={loadError} onRetry={load} />
                ) : (
                    <>
                        <View
                            className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
                            style={{ backgroundColor: COLORS.primary + '14' }}
                        >
                            <UserPlus size={26} color={COLORS.primary} />
                        </View>

                        <Text
                            style={{ color: COLORS.textSecondary }}
                            className="text-[12px] font-medium leading-relaxed mb-5"
                        >
                            {t('privacy.nominee.help')}
                        </Text>

                        <FormField
                            label="Their name"
                            value={fullName}
                            onChangeText={setFullName}
                            required
                            error={fieldErrors.full_name}
                            placeholder="Full name"
                        />
                        <FormField
                            label="Their relationship to you"
                            value={relationship}
                            onChangeText={setRelationship}
                            required
                            error={fieldErrors.relationship}
                            placeholder="e.g. Spouse, Father, Sister"
                        />
                        <FormField
                            label="Their phone number"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            error={fieldErrors.phone}
                            placeholder="+91..."
                        />
                        <FormField
                            label="Their email (optional)"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            error={fieldErrors.email}
                            placeholder="name@example.com"
                        />

                        {/* The nominee never consented to being in our records.
                            Telling the rider to inform them is the only thing
                            we can practically do about that, so we do it. */}
                        <View
                            className="flex-row rounded-2xl border p-3.5 mb-4"
                            style={{ borderColor: COLORS.border, backgroundColor: COLORS.background }}
                        >
                            <Info size={14} color={COLORS.textSecondary} />
                            <Text
                                style={{ color: COLORS.textSecondary }}
                                className="text-[11px] font-medium leading-relaxed ml-2.5 flex-1"
                            >
                                {t('privacy.nominee.warn')}
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={() => void save()}
                            disabled={!canSave || saving}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !canSave || saving }}
                            style={{ backgroundColor: COLORS.primary, opacity: !canSave || saving ? 0.5 : 1 }}
                            className="w-full py-4 rounded-2xl flex-row justify-center items-center"
                        >
                            {saving ? (
                                <ActivityIndicator color="#FFF" />
                            ) : (
                                <Text className="text-white font-bold text-base">{t('common.save')}</Text>
                            )}
                        </TouchableOpacity>

                        {nominee?.full_name ? (
                            <TouchableOpacity
                                onPress={() => void remove()}
                                disabled={saving}
                                accessibilityRole="button"
                                className="w-full py-3.5 rounded-2xl items-center mt-2"
                            >
                                <Text style={{ color: COLORS.danger }} className="font-bold text-xs">
                                    Remove my nominee
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                )}
            </ScrollView>
        </AppShell>
    );
}
