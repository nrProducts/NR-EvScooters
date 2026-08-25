import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, Lock, Mail, ChevronRight } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { ConsentToggle } from '../../components/ui/ConsentToggle';
import { ErrorState } from '../../components/ui/ErrorState';
import { LanguageToggle } from '../../i18n/LanguageToggle';
import { useT, useLangStore } from '../../i18n';
import type { CopyKey } from '../../i18n';
import { useConsent } from '../../hooks/useConsent';
import { COLORS } from '../../constants/theme';
import { GRIEVANCE_OFFICER_EMAIL, GRIEVANCE_OFFICER_NAME } from '../../constants/privacy';
import { formatDate } from '../../constants/status';

/**
 * The rider's privacy hub: consent choices, rights requests, nominee and the
 * grievance channel, all in one place.
 *
 * DPDPA s.6(4) requires withdrawal to be as easy as giving consent — hence
 * live toggles here rather than a support ticket. The optional toggles write
 * immediately on change; there is no Save button to forget to press.
 */
export default function PrivacyHubScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useT();
    const hydrate = useLangStore((s) => s.hydrate);
    const langReady = useLangStore((s) => s.ready);
    const { state, loading, saving, error, reload, setOne } = useConsent();

    useEffect(() => {
        if (!langReady) void hydrate();
    }, [langReady, hydrate]);

    const required = state?.items.filter((i) => i.required) ?? [];
    const optional = state?.items.filter((i) => !i.required) ?? [];

    return (
        <AppShell title={t('privacy.title')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                {loading && !state ? (
                    <Spinner size={18} color={COLORS.primary} />
                ) : !state ? (
                    <ErrorState message={error ?? 'Could not load your privacy settings.'} onRetry={reload} />
                ) : (
                    <>
                        <LanguageToggle label={t('lang.label')} />

                        {/* --- consent ------------------------------------- */}
                        <Heading>{t('privacy.consent.heading')}</Heading>

                        {optional.map((item) => (
                            <ConsentToggle
                                key={item.purpose}
                                title={t(`purpose.${item.purpose}.title` as CopyKey)}
                                summary={t(`purpose.${item.purpose}.summary` as CopyKey)}
                                value={item.granted}
                                busy={saving}
                                onChange={(next) => void setOne(item.purpose, next)}
                            />
                        ))}

                        <View
                            className="rounded-2xl border p-3.5 mt-1 mb-2"
                            style={{ borderColor: COLORS.border, backgroundColor: COLORS.background }}
                        >
                            <View className="flex-row items-center mb-2">
                                <Lock size={13} color={COLORS.textSecondary} />
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[11px] font-medium leading-relaxed ml-2 flex-1"
                                >
                                    {t('privacy.consent.required.note')}
                                </Text>
                            </View>
                            {required.map((item) => (
                                <View key={item.purpose} className="flex-row justify-between py-1">
                                    <Text
                                        style={{ color: COLORS.textPrimary }}
                                        className="text-[11px] font-semibold flex-1 mr-3"
                                    >
                                        {t(`purpose.${item.purpose}.title` as CopyKey)}
                                    </Text>
                                    <Text
                                        style={{ color: item.granted ? COLORS.success : COLORS.warning }}
                                        className="text-[10px] font-bold"
                                    >
                                        {item.decided_at ? formatDate(item.decided_at) : t('common.off')}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {error ? (
                            <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mb-2">
                                {error}
                            </Text>
                        ) : null}

                        {/* --- rights -------------------------------------- */}
                        <Heading>{t('privacy.data.heading')}</Heading>

                        <LinkRow
                            title={t('privacy.summary')}
                            help={t('privacy.summary.help')}
                            onPress={() => router.push('/privacy/summary' as never)}
                        />
                        <LinkRow
                            title={t('privacy.data.correct')}
                            help={t('privacy.data.correct.help')}
                            onPress={() => router.push('/privacy/requests?type=correction' as never)}
                        />
                        <LinkRow
                            title={t('privacy.data.delete')}
                            help={t('privacy.data.delete.help')}
                            destructive
                            onPress={() => router.push('/privacy/requests?type=erasure' as never)}
                        />

                        {/* --- nominee ------------------------------------- */}
                        <Heading>{t('privacy.nominee.heading')}</Heading>
                        <LinkRow
                            title={t('privacy.nominee.edit')}
                            help={t('privacy.nominee.help')}
                            onPress={() => router.push('/privacy/nominee' as never)}
                        />

                        {/* --- grievance ----------------------------------- */}
                        <Heading>{t('privacy.grievance.heading')}</Heading>
                        <LinkRow
                            title={t('privacy.grievance.cta')}
                            help={t('privacy.grievance.help')}
                            onPress={() => router.push('/privacy/requests?type=grievance' as never)}
                        />

                        <LinkRow
                            title={t('privacy.requests.viewAll')}
                            onPress={() => router.push('/privacy/requests' as never)}
                        />

                        {/* --- notice + officer ---------------------------- */}
                        <TouchableOpacity
                            onPress={() => router.push('/privacy/notice' as never)}
                            accessibilityRole="link"
                            className="flex-row items-center py-4"
                        >
                            <FileText size={16} color={COLORS.primary} />
                            <Text style={{ color: COLORS.primary }} className="text-xs font-bold ml-2">
                                {t('privacy.notice.link')}
                            </Text>
                        </TouchableOpacity>

                        <View
                            className="rounded-2xl border p-3.5"
                            style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                        >
                            <Text
                                style={{ color: COLORS.textSecondary }}
                                className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                            >
                                {t('privacy.officer.heading')}
                            </Text>
                            <Text style={{ color: COLORS.textPrimary }} className="text-xs font-bold mb-2">
                                {GRIEVANCE_OFFICER_NAME}
                            </Text>
                            <TouchableOpacity
                                onPress={() => void Linking.openURL(`mailto:${GRIEVANCE_OFFICER_EMAIL}`)}
                                accessibilityRole="link"
                                className="flex-row items-center"
                            >
                                <Mail size={13} color={COLORS.primary} />
                                <Text style={{ color: COLORS.primary }} className="text-xs font-bold ml-2">
                                    {GRIEVANCE_OFFICER_EMAIL}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </ScrollView>
        </AppShell>
    );
}

const Heading: React.FC<{ children: string }> = ({ children }) => (
    <Text
        style={{ color: COLORS.textSecondary }}
        className="text-[11px] font-bold uppercase tracking-wider mt-5 mb-2.5"
    >
        {children}
    </Text>
);

const LinkRow: React.FC<{
    title: string;
    help?: string;
    destructive?: boolean;
    onPress: () => void;
}> = ({ title, help, destructive, onPress }) => (
    <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        className="flex-row items-center rounded-2xl border p-3.5 mb-2.5"
        style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
    >
        <View className="flex-1 mr-3">
            <Text
                style={{ color: destructive ? COLORS.danger : COLORS.textPrimary }}
                className="text-sm font-bold"
            >
                {title}
            </Text>
            {help ? (
                <Text
                    style={{ color: COLORS.textSecondary }}
                    className="text-[11px] font-medium leading-relaxed mt-1"
                >
                    {help}
                </Text>
            ) : null}
        </View>
        <ChevronRight size={16} color={COLORS.textSecondary} />
    </TouchableOpacity>
);
