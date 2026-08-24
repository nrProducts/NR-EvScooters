import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { ErrorState } from '../../components/ui/ErrorState';
import { confirmAction, notify } from '../../lib/confirm';
import { useT } from '../../i18n';
import type { CopyKey } from '../../i18n';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/ApiError';
import { COLORS } from '../../constants/theme';
import { formatDate } from '../../constants/status';
import { statusColour } from './requests';
import type { ApiPrivacyRequest } from '../../types/api';

/**
 * One rights request: where it is, what we promised, and what we decided.
 *
 * The resolution and rejection text is shown verbatim — it is written for the
 * rider and is the substance of our response to a statutory request, not an
 * internal note.
 */
export default function PrivacyRequestDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const insets = useSafeAreaInsets();
    const { t } = useT();

    const [request, setRequest] = useState<ApiPrivacyRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = React.useCallback(async () => {
        if (!id) return;
        setError(null);
        try {
            setRequest(await api.privacyRequest(id));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load that request.');
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const cancel = async () => {
        if (!request) return;
        const confirmed = await confirmAction({
            title: t('request.cancel'),
            message: 'We will stop working on this request.',
            confirmLabel: t('request.cancel'),
            cancelLabel: t('common.close'),
            destructive: true,
        });
        if (!confirmed) return;

        setBusy(true);
        try {
            setRequest(await api.cancelPrivacyRequest(request.id));
        } catch (err) {
            notify('Could not cancel', err instanceof ApiError ? err.message : 'Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const download = async () => {
        if (!request) return;
        setBusy(true);
        try {
            const { url } = await api.exportUrl(request.id);
            void Linking.openURL(url);
        } catch (err) {
            notify(
                'Download unavailable',
                err instanceof ApiError ? err.message : 'Please request a new copy.',
            );
        } finally {
            setBusy(false);
        }
    };

    const isOpen = request
        ? ['open', 'in_progress', 'awaiting_principal'].includes(request.status)
        : false;

    return (
        <AppShell title={t('privacy.requests.heading')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                {error ? (
                    <ErrorState message={error} onRetry={load} />
                ) : !request ? (
                    <Spinner size={18} color={COLORS.primary} />
                ) : (
                    <>
                        <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black mb-1">
                            {t(`request.type.${request.type}` as CopyKey)}
                        </Text>
                        <Text
                            style={{ color: COLORS.textSecondary }}
                            className="text-[11px] font-semibold mb-4"
                        >
                            {t('request.reference', { reference: request.reference })}
                        </Text>

                        <View
                            className="rounded-2xl border p-4 mb-4"
                            style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                        >
                            <Row
                                label="Status"
                                value={t(`request.status.${request.status}` as CopyKey)}
                                colour={statusColour(request.status)}
                            />
                            <Row label="Raised" value={formatDate(request.created_at)} />
                            {isOpen ? (
                                <Row
                                    label="We will respond by"
                                    value={formatDate(request.sla_due_at)}
                                />
                            ) : null}
                            {request.completed_at ? (
                                <Row label="Closed" value={formatDate(request.completed_at)} />
                            ) : null}
                            {/* Erasure only: the rider can still change their
                                mind until this date, and being told so is the
                                point of having the window at all. */}
                            {request.grace_ends_at && isOpen ? (
                                <Row
                                    label="You can still cancel until"
                                    value={formatDate(request.grace_ends_at)}
                                    colour={COLORS.warning}
                                />
                            ) : null}
                        </View>

                        {request.details ? (
                            <Block label="What you told us" body={request.details} />
                        ) : null}

                        {request.requested_changes ? (
                            <Block
                                label="What you asked us to correct"
                                body={Object.entries(request.requested_changes)
                                    .map(([field, value]) => `${field.replace(/_/g, ' ')}: ${value}`)
                                    .join('\n')}
                            />
                        ) : null}

                        {request.resolution_notes ? (
                            <Block label="Our response" body={request.resolution_notes} />
                        ) : null}

                        {request.rejection_reason ? (
                            <Block
                                label="Why we could not do this"
                                body={request.rejection_reason}
                                tone={COLORS.danger}
                            />
                        ) : null}

                        {request.type === 'access_export' && request.status === 'completed' ? (
                            <TouchableOpacity
                                onPress={() => void download()}
                                disabled={busy}
                                accessibilityRole="button"
                                style={{ backgroundColor: COLORS.primary, opacity: busy ? 0.6 : 1 }}
                                className="w-full py-3.5 rounded-2xl flex-row justify-center items-center mt-2"
                            >
                                <Download size={16} color="#FFF" />
                                <Text className="text-white font-bold text-sm ml-2">
                                    {t('privacy.data.export')}
                                </Text>
                            </TouchableOpacity>
                        ) : null}

                        {isOpen ? (
                            <TouchableOpacity
                                onPress={() => void cancel()}
                                disabled={busy}
                                accessibilityRole="button"
                                className="w-full py-3.5 rounded-2xl items-center mt-2 border"
                                style={{ borderColor: COLORS.border }}
                            >
                                <Text style={{ color: COLORS.danger }} className="font-bold text-xs">
                                    {t('request.cancel')}
                                </Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                )}
            </ScrollView>
        </AppShell>
    );
}

const Row: React.FC<{ label: string; value: string; colour?: string }> = ({
    label, value, colour,
}) => (
    <View className="flex-row justify-between items-center py-1.5">
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
            {label}
        </Text>
        <Text
            style={{ color: colour ?? COLORS.textPrimary }}
            className="text-[11px] font-bold text-right flex-1 ml-4"
        >
            {value}
        </Text>
    </View>
);

const Block: React.FC<{ label: string; body: string; tone?: string }> = ({ label, body, tone }) => (
    <View
        className="rounded-2xl border p-4 mb-3"
        style={{ borderColor: tone ?? COLORS.border, backgroundColor: COLORS.card }}
    >
        <Text
            style={{ color: COLORS.textSecondary }}
            className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
        >
            {label}
        </Text>
        <Text
            style={{ color: tone ?? COLORS.textPrimary }}
            className="text-[12px] font-medium leading-relaxed"
        >
            {body}
        </Text>
    </View>
);
