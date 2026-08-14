import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../../components/AppShell';
import { COLORS } from '../../constants/theme';
import { LanguageToggle } from '../../i18n/LanguageToggle';
import { useT, useLangStore } from '../../i18n';
import { api } from '../../lib/api';
import { ApiError } from '../../lib/ApiError';
import type { ApiConsentNotice } from '../../types/api';

/**
 * The full privacy notice, rendered from the API rather than the app bundle.
 *
 * That indirection is the point: a corrected notice must reach riders without
 * an app-store release, and consent_records.notice_version has to resolve to
 * the exact text the rider saw, years later, in a dispute.
 */
export default function PrivacyNoticeScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useT();
    const lang = useLangStore((s) => s.lang);
    const [notice, setNotice] = useState<ApiConsentNotice | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setNotice(null);
        setError(null);
        api.consentNotice(lang)
            .then((data) => {
                if (!cancelled) setNotice(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof ApiError ? err.message : 'Could not load the privacy notice.',
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    }, [lang]);

    return (
        <AppShell title={t('privacy.notice.link')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                <LanguageToggle label={t('lang.label')} />

                {error ? (
                    <Text style={{ color: COLORS.danger }} className="text-xs font-semibold">
                        {error}
                    </Text>
                ) : !notice ? (
                    <ActivityIndicator color={COLORS.primary} />
                ) : (
                    <>
                        <Text
                            style={{ color: COLORS.textSecondary }}
                            className="text-[10px] font-bold uppercase tracking-wider mb-4"
                        >
                            {t('consent.version', {
                                version: notice.version,
                                date: new Date(notice.effective_from).toLocaleDateString(),
                            })}
                        </Text>
                        <Markdown body={notice.body} />
                    </>
                )}
            </ScrollView>
        </AppShell>
    );
}

/**
 * Minimal Markdown renderer for the notice body.
 *
 * Deliberately not a dependency: the notice uses headings, paragraphs, bullets
 * and bold, and a full Markdown engine would be several hundred KB of bundle
 * for that. If the notice ever needs tables or links, revisit — do not quietly
 * extend this until it becomes one.
 */
const Markdown: React.FC<{ body: string }> = ({ body }) => {
    const blocks = body.trim().split(/\n{2,}/);

    return (
        <View>
            {blocks.map((block, i) => {
                const trimmed = block.trim();

                if (trimmed.startsWith('## ')) {
                    return (
                        <Text
                            key={i}
                            style={{ color: COLORS.textPrimary }}
                            className="text-base font-black mt-5 mb-2"
                        >
                            {trimmed.slice(3)}
                        </Text>
                    );
                }
                if (trimmed.startsWith('# ')) {
                    return (
                        <Text
                            key={i}
                            style={{ color: COLORS.textPrimary }}
                            className="text-xl font-black mb-3"
                        >
                            {trimmed.slice(2)}
                        </Text>
                    );
                }
                if (trimmed.startsWith('- ')) {
                    return (
                        <View key={i} className="mb-2">
                            {trimmed.split('\n').map((line, j) => (
                                <View key={j} className="flex-row mb-1">
                                    <Text style={{ color: COLORS.textSecondary }} className="text-sm mr-2">
                                        •
                                    </Text>
                                    <Text
                                        style={{ color: COLORS.textPrimary }}
                                        className="text-[13px] font-medium leading-relaxed flex-1"
                                    >
                                        {stripBold(line.replace(/^[-*]\s+/, ''))}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    );
                }
                return (
                    <Text
                        key={i}
                        style={{ color: COLORS.textPrimary }}
                        className="text-[13px] font-medium leading-relaxed mb-3"
                    >
                        {stripBold(trimmed.replace(/\n/g, ' '))}
                    </Text>
                );
            })}
        </View>
    );
};

/** Bold markers are removed rather than rendered — inline styling would need
 *  nested <Text> parsing that this renderer deliberately does not do. */
const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1');
