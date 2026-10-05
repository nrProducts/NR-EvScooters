import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Share2, ShieldOff } from 'lucide-react-native';
import { AppShell } from '../../components/AppShell';
import { ErrorState } from '../../components/ui/ErrorState';
import { Spinner } from '../../components/Spinner';
import { useT } from '../../i18n';
import type { CopyKey } from '../../i18n';
import { usePrivacySummary } from '../../hooks/usePrivacySummary';
import { COLORS } from '../../constants/theme';
import { formatDate } from '../../constants/status';

/**
 * "What we know about you" — the rider's DPDPA s.11 response.
 *
 * s.11(1)(a) is a right to a SUMMARY of the personal data being processed and
 * the processing activities undertaken, not to a copy of it. So this screen
 * shows the shape of the record — which categories exist, how much of each,
 * and how long each is kept — rather than dumping rows the rider can already
 * read elsewhere in the app.
 *
 * s.11(1)(b) is the half no export of the rider's own data could ever answer:
 * the identities of the processors their data reaches, and what each one
 * gets. That is the "shared with" section, and it is the reason this screen
 * replaced the download rather than sitting beside it.
 */
export default function PrivacySummaryScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useT();
    const { summary, loading, error, reload } = usePrivacySummary();

    return (
        <AppShell title={t('privacy.summary')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                {loading && !summary ? (
                    <Spinner size={18} color={COLORS.primary} />
                ) : error && !summary ? (
                    <ErrorState message={error} onRetry={reload} />
                ) : !summary ? null : (
                    <>
                        <Text
                            style={{ color: COLORS.textSecondary }}
                            className="text-[11px] font-medium leading-relaxed mb-4"
                        >
                            {t('privacy.summary.help')}
                        </Text>

                        {/* --- identity ------------------------------------ */}
                        <Heading>{t('privacy.summary.identity')}</Heading>
                        <Card>
                            <Detail label={t('privacy.summary.name')} value={summary.identity.full_name} />
                            <Detail label={t('privacy.summary.phone')} value={summary.identity.phone} />
                            <Detail label={t('privacy.summary.email')} value={summary.identity.email} />
                            <Detail
                                label={t('privacy.summary.dob')}
                                value={summary.identity.date_of_birth
                                    ? formatDate(summary.identity.date_of_birth)
                                    : null}
                            />
                            <Detail label={t('privacy.summary.address')} value={summary.identity.address} />
                            {summary.identity.identity_documents.map((doc, i) => (
                                <Detail
                                    key={`${doc.document_type}-${i}`}
                                    label={doc.document_type.replace(/_/g, ' ')}
                                    // Only ever the last four. The rest was checked at
                                    // upload and discarded, which the note below says.
                                    value={doc.last4 ? `•••• ${doc.last4} · ${doc.status}` : doc.status}
                                />
                            ))}
                        </Card>

                        <TouchableOpacity
                            onPress={() => router.push('/privacy/requests?type=correction' as never)}
                            accessibilityRole="button"
                            className="flex-row items-center rounded-2xl border p-3.5 mb-2"
                            style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                        >
                            <Text
                                style={{ color: COLORS.primary }}
                                className="text-xs font-bold flex-1 mr-3"
                            >
                                {t('privacy.summary.correctCta')}
                            </Text>
                            <ChevronRight size={16} color={COLORS.primary} />
                        </TouchableOpacity>

                        {/* --- categories ---------------------------------- */}
                        <Heading>{t('privacy.summary.categories')}</Heading>
                        {summary.categories.map((category) => (
                            <View
                                key={category.key}
                                className="rounded-2xl border p-3.5 mb-2.5"
                                style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                            >
                                <View className="flex-row items-center justify-between mb-1">
                                    <Text
                                        style={{ color: COLORS.textPrimary }}
                                        className="text-sm font-bold flex-1 mr-3"
                                    >
                                        {category.label}
                                    </Text>
                                    <Text
                                        style={{
                                            color: category.count > 0
                                                ? COLORS.primary
                                                : COLORS.textSecondary,
                                        }}
                                        className="text-[11px] font-extrabold"
                                    >
                                        {category.count > 0
                                            ? t('privacy.summary.records', {
                                                count: String(category.count),
                                            })
                                            : t('privacy.summary.none')}
                                    </Text>
                                </View>
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[11px] font-medium leading-relaxed"
                                >
                                    {category.what}
                                </Text>
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[10px] font-semibold leading-relaxed mt-1.5"
                                >
                                    {category.retention}
                                </Text>
                            </View>
                        ))}

                        {/* --- consents ------------------------------------ */}
                        {summary.consents.length > 0 ? (
                            <>
                                <Heading>{t('privacy.summary.consents')}</Heading>
                                <Card>
                                    {summary.consents.map((consent) => (
                                        <View
                                            key={consent.purpose}
                                            className="flex-row justify-between items-center py-1.5"
                                        >
                                            <Text
                                                style={{ color: COLORS.textPrimary }}
                                                className="text-[11px] font-semibold flex-1 mr-3"
                                            >
                                                {t(`purpose.${consent.purpose}.title` as CopyKey)}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: consent.granted
                                                        ? COLORS.success
                                                        : COLORS.textSecondary,
                                                }}
                                                className="text-[10px] font-bold"
                                            >
                                                {consent.granted
                                                    ? t('common.on')
                                                    : t('common.off')}
                                            </Text>
                                        </View>
                                    ))}
                                </Card>
                            </>
                        ) : null}

                        {/* --- s.11(1)(b) ---------------------------------- */}
                        <Heading>{t('privacy.summary.shared')}</Heading>
                        {summary.shared_with.map((recipient) => (
                            <View
                                key={recipient.name}
                                className="rounded-2xl border p-3.5 mb-2.5"
                                style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
                            >
                                <View className="flex-row items-center mb-1">
                                    <Share2 size={13} color={COLORS.primary} />
                                    <Text
                                        style={{ color: COLORS.textPrimary }}
                                        className="text-sm font-bold ml-2 flex-1"
                                    >
                                        {recipient.name}
                                    </Text>
                                </View>
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[11px] font-medium leading-relaxed"
                                >
                                    {recipient.receives}
                                </Text>
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[10px] font-semibold leading-relaxed mt-1.5"
                                >
                                    {recipient.why}
                                </Text>
                            </View>
                        ))}

                        {/* --- what we do not hold ------------------------- */}
                        <Heading>{t('privacy.summary.notHeld')}</Heading>
                        <View
                            className="rounded-2xl border p-3.5 mb-3"
                            style={{
                                borderColor: COLORS.success,
                                backgroundColor: COLORS.success + '10',
                            }}
                        >
                            {summary.not_held.map((line, i) => (
                                <View key={i} className="flex-row mb-2 last:mb-0">
                                    <ShieldOff size={13} color={COLORS.success} />
                                    <Text
                                        style={{ color: COLORS.textPrimary }}
                                        className="text-[11px] font-medium leading-relaxed ml-2 flex-1"
                                    >
                                        {line}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <Text
                            style={{ color: COLORS.textSecondary }}
                            className="text-[10px] font-medium mt-1"
                        >
                            {t('privacy.summary.generated', {
                                date: formatDate(summary.generated_at),
                            })}
                        </Text>
                    </>
                )}
            </ScrollView>
        </AppShell>
    );
}

// ---------------------------------------------------------------------------
// Local presentational pieces
// ---------------------------------------------------------------------------

const Heading: React.FC<{ children: string }> = ({ children }) => (
    <Text
        style={{ color: COLORS.textSecondary }}
        className="text-[11px] font-bold uppercase tracking-wider mt-5 mb-2.5"
    >
        {children}
    </Text>
);

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <View
        className="rounded-2xl border p-3.5 mb-2.5"
        style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
    >
        {children}
    </View>
);

/** A single stored value. Omitted entirely when we hold nothing for it. */
const Detail: React.FC<{ label: string; value: string | null }> = ({ label, value }) => {
    if (!value) return null;
    return (
        <View className="flex-row justify-between items-start py-1.5">
            <Text
                style={{ color: COLORS.textSecondary }}
                className="text-[11px] font-semibold capitalize mr-4"
            >
                {label}
            </Text>
            <Text
                style={{ color: COLORS.textPrimary }}
                className="text-[11px] font-bold text-right flex-1"
            >
                {value}
            </Text>
        </View>
    );
};
