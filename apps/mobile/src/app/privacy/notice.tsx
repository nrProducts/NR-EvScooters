import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../../components/AppShell';
import { Markdown } from '../../components/Markdown';
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
                    <Spinner size={18} color={COLORS.primary} />
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
