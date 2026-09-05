import React, { useEffect, useState } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, ShieldAlert } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { ErrorState } from '../../components/ui/ErrorState';
import { ChipSelect } from '../../components/ui/ChipSelect';
import { Spinner } from '../../components/Spinner';
import { CheckRow } from '../../components/ui/CheckRow';
import { confirmAction, notify } from '../../lib/confirm';
import { useT } from '../../i18n';
import type { CopyKey } from '../../i18n';
import { usePrivacyRequests } from '../../hooks/usePrivacyRequests';
import { COLORS } from '../../constants/theme';
import { formatDate } from '../../constants/status';
import type { CorrectableField, DpRequestType } from '../../types/api';

/** Statuses we still owe the rider an answer on. Mirrors the backend's list. */
const OPEN_STATUSES = ['open', 'in_progress', 'awaiting_principal'];

/** Keys, not labels — module scope does not re-run on a language change. */
const CORRECTABLE_KEYS: { key: CorrectableField; labelKey: CopyKey }[] = [
    { key: 'full_name', labelKey: 'correctable.full_name' },
    { key: 'date_of_birth', labelKey: 'correctable.date_of_birth' },
    { key: 'aadhaar_details', labelKey: 'correctable.aadhaar_details' },
    { key: 'driving_licence_details', labelKey: 'correctable.driving_licence_details' },
    { key: 'other', labelKey: 'correctable.other' },
];

/**
 * Rights requests: the list, and the forms for raising a new one.
 *
 * `?type=` opens straight into the right form, so the entries on the privacy
 * hub each land where they promised rather than on a menu. There is no
 * `access_export` form: s.11 access is answered on /privacy/summary without a
 * request row, and only historical export rows still appear in the list.
 */
export default function PrivacyRequestsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { type } = useLocalSearchParams<{ type?: DpRequestType }>();
    const { t } = useT();
    const { requests, loading, submitting, error, reload, create } = usePrivacyRequests();

    const [mode, setMode] = useState<DpRequestType | null>(null);
    const [details, setDetails] = useState('');
    const [field, setField] = useState<CorrectableField>('full_name');
    const [correctedValue, setCorrectedValue] = useState('');
    const [understood, setUnderstood] = useState(false);

    useEffect(() => {
        if (type) setMode(type);
    }, [type]);

    // --- erasure ----------------------------------------------------------
    const runErasure = async () => {
        const confirmed = await confirmAction({
            title: t('erasure.title'),
            message: `${t('erasure.body')}\n\n${t('erasure.retained')}`,
            confirmLabel: t('erasure.confirm'),
            cancelLabel: t('erasure.keep'),
            destructive: true,
        });
        if (!confirmed) return;

        const result = await create({ type: 'erasure', details: details.trim() || undefined });
        if (!result.ok) {
            notify(t('requestsScreen.error.sendFailed'), result.message);
            return;
        }
        notify(
            t('requestsScreen.received.title'),
            t('request.submitted', { reference: result.request.reference }),
        );
        reset();
    };

    const submitSimple = async (requestType: DpRequestType) => {
        const result = await create({
            type: requestType,
            details: details.trim() || undefined,
            requested_changes:
                requestType === 'correction'
                    ? [{ field, value: correctedValue.trim() }]
                    : undefined,
        });
        if (!result.ok) {
            notify(t('requestsScreen.error.sendFailed'), result.message);
            return;
        }
        notify(t('requestsScreen.received.title'), t('request.submitted', { reference: result.request.reference }));
        reset();
    };

    const reset = () => {
        setMode(null);
        setDetails('');
        setCorrectedValue('');
        setUnderstood(false);
        router.setParams({ type: undefined as never });
    };

    const nextDue = requests
        .filter((r) => OPEN_STATUSES.includes(r.status))
        .map((r) => r.sla_due_at)
        .sort()[0];

    return (
        <AppShell title={t('privacy.requests.heading')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                {mode === 'correction' ? (
                    <Card title={t('privacy.data.correct')} help={t('privacy.data.correct.help')}>
                        <ChipSelect<CorrectableField>
                            label={t('requestsScreen.whatIsWrong')}
                            options={CORRECTABLE_KEYS.map(({ key, labelKey }) => ({ key, label: t(labelKey) }))}
                            value={field}
                            onChange={setField}
                        />
                        <Field
                            label={t('requestsScreen.whatShouldItBe')}
                            value={correctedValue}
                            onChange={setCorrectedValue}
                            placeholder={t('requestsScreen.correctPlaceholder')}
                        />
                        <Field
                            label={t('request.detailsLabel')}
                            value={details}
                            onChange={setDetails}
                            placeholder={t('request.detailsPlaceholder')}
                            multiline
                        />
                        <PrimaryButton
                            label={t('request.submit')}
                            busy={submitting}
                            disabled={correctedValue.trim().length === 0}
                            onPress={() => void submitSimple('correction')}
                        />
                        <SecondaryButton label={t('common.cancel')} onPress={reset} />
                    </Card>
                ) : null}

                {mode === 'grievance' ? (
                    <Card title={t('privacy.grievance.cta')} help={t('privacy.grievance.help')}>
                        <Field
                            label={t('request.detailsLabel')}
                            value={details}
                            onChange={setDetails}
                            placeholder={t('request.detailsPlaceholder')}
                            multiline
                        />
                        <PrimaryButton
                            label={t('request.submit')}
                            busy={submitting}
                            disabled={details.trim().length < 10}
                            onPress={() => void submitSimple('grievance')}
                        />
                        <SecondaryButton label={t('common.cancel')} onPress={reset} />
                    </Card>
                ) : null}

                {mode === 'erasure' ? (
                    <Card title={t('erasure.title')} help={t('erasure.body')} destructive>
                        {/* The retained-records paragraph is shown BEFORE the
                            confirm, not buried in it. A rider agreeing to
                            deletion has to have been told what survives. */}
                        <View
                            className="rounded-xl border p-3 mb-3"
                            style={{ borderColor: COLORS.warning, backgroundColor: COLORS.warning + '10' }}
                        >
                            <View className="flex-row">
                                <ShieldAlert size={14} color={COLORS.warning} />
                                <Text
                                    style={{ color: COLORS.textPrimary }}
                                    className="text-[11px] font-medium leading-relaxed ml-2 flex-1"
                                >
                                    {t('erasure.retained')}
                                </Text>
                            </View>
                        </View>

                        {/* A distinct acknowledgement, not a second copy of the
                            paragraph above it. The rider has to affirm they
                            understood what survives the erasure, which is only
                            meaningful if the two read differently. */}
                        <CheckRow
                            checked={understood}
                            onToggle={() => setUnderstood(!understood)}
                            text={t('erasure.understand')}
                        />

                        <View className="h-3" />
                        <PrimaryButton
                            label={t('privacy.data.delete')}
                            busy={submitting}
                            disabled={!understood}
                            destructive
                            onPress={() => void runErasure()}
                        />
                        <SecondaryButton label={t('erasure.keep')} onPress={reset} />
                    </Card>
                ) : null}

                {/* --- the list --------------------------------------------- */}
                <Text
                    style={{ color: COLORS.textSecondary }}
                    className="text-[11px] font-bold uppercase tracking-wider mt-2 mb-2.5"
                >
                    {t('privacy.requests.heading')}
                </Text>

                {loading ? (
                    <Spinner size={18} color={COLORS.primary} />
                ) : error && requests.length === 0 ? (
                    <ErrorState message={error} onRetry={reload} />
                ) : requests.length === 0 ? (
                    <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium">
                        {t('privacy.requests.empty')}
                    </Text>
                ) : (
                    requests.map((request) => (
                        <TouchableOpacity
                            key={request.id}
                            onPress={() => router.push(`/privacy/${request.id}` as never)}
                            accessibilityRole="button"
                            className="flex-row items-center rounded-2xl border p-3.5 mb-2.5"
                            style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                        >
                            <View className="flex-1 mr-3">
                                <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold">
                                    {t(`request.type.${request.type}` as CopyKey)}
                                </Text>
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[10px] font-semibold mt-0.5"
                                >
                                    {t('request.reference', { reference: request.reference })}
                                </Text>
                                <Text
                                    style={{ color: statusColour(request.status) }}
                                    className="text-[11px] font-bold mt-1"
                                >
                                    {t(`request.status.${request.status}` as CopyKey)}
                                </Text>
                            </View>
                            <ChevronRight size={16} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    ))
                )}

                {/* The promise only applies to a request we still owe an
                    answer on, and to the SOONEST of those — not to whichever
                    happens to be newest, which for a completed export left
                    "we will respond by" sitting under a request marked Done. */}
                {nextDue ? (
                    <Text
                        style={{ color: COLORS.textSecondary }}
                        className="text-[10px] font-medium mt-2"
                    >
                        {t('request.due', { date: formatDate(nextDue) })}
                    </Text>
                ) : null}
            </ScrollView>
        </AppShell>
    );
}

export function statusColour(status: string): string {
    if (status === 'completed') return COLORS.success;
    if (status === 'rejected') return COLORS.danger;
    if (status === 'withdrawn') return COLORS.textSecondary;
    return COLORS.warning;
}

// ---------------------------------------------------------------------------
// Local presentational pieces
// ---------------------------------------------------------------------------

const Card: React.FC<{
    title: string;
    help: string;
    destructive?: boolean;
    children: React.ReactNode;
}> = ({ title, help, destructive, children }) => (
    <View
        className="rounded-2xl border p-4 mb-5"
        style={{
            borderColor: destructive ? COLORS.danger : COLORS.border,
            backgroundColor: COLORS.card,
        }}
    >
        <Text
            style={{ color: destructive ? COLORS.danger : COLORS.textPrimary }}
            className="text-sm font-extrabold mb-1"
        >
            {title}
        </Text>
        <Text
            style={{ color: COLORS.textSecondary }}
            className="text-[11px] font-medium leading-relaxed mb-3"
        >
            {help}
        </Text>
        {children}
    </View>
);

const Field: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    multiline?: boolean;
}> = ({ label, value, onChange, placeholder, multiline }) => (
    <View className="mb-3.5">
        <Text
            style={{ color: COLORS.textSecondary }}
            className="text-[11px] font-bold uppercase tracking-wider mb-1.5"
        >
            {label}
        </Text>
        <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={COLORS.gray[400]}
            multiline={multiline}
            numberOfLines={multiline ? 4 : 1}
            style={{
                color: COLORS.textPrimary,
                borderColor: COLORS.border,
                backgroundColor: COLORS.background,
                textAlignVertical: multiline ? 'top' : 'center',
                minHeight: multiline ? 96 : 48,
            }}
            className="border rounded-xl px-3.5 py-3 text-sm font-medium"
        />
    </View>
);

const PrimaryButton: React.FC<{
    label: string;
    onPress: () => void;
    busy?: boolean;
    disabled?: boolean;
    destructive?: boolean;
    icon?: React.ReactNode;
}> = ({ label, onPress, busy, disabled, destructive, icon }) => (
    <TouchableOpacity
        onPress={onPress}
        disabled={busy || disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!(busy || disabled) }}
        style={{
            backgroundColor: destructive ? COLORS.danger : COLORS.primary,
            opacity: busy || disabled ? 0.5 : 1,
        }}
        className="w-full py-3.5 rounded-2xl flex-row justify-center items-center"
    >
        {busy ? (
            <Spinner size={18} color="#FFF" />
        ) : (
            <>
                {icon ? <View className="mr-2">{icon}</View> : null}
                <Text className="text-white font-bold text-sm">{label}</Text>
            </>
        )}
    </TouchableOpacity>
);

const SecondaryButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        className="w-full py-3 rounded-2xl items-center mt-2"
    >
        <Text style={{ color: COLORS.textSecondary }} className="font-bold text-xs">
            {label}
        </Text>
    </TouchableOpacity>
);
