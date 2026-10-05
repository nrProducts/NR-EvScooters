import React, { useEffect, useState } from 'react';
import { Text, ScrollView } from 'react-native';
import { Spinner } from '../../components/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../../components/AppShell';
import { Markdown } from '../../components/Markdown';
import { COLORS } from '../../constants/theme';
import { LanguageToggle } from '../../i18n/LanguageToggle';
import { useT, useLangStore, documentLanguage } from '../../i18n';
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
    // Legal text exists only in the languages it has actually been reviewed
    // in — Hindi falls back to English rather than being machine-translated.
    // See src/i18n/documentLanguage.ts.
    const docLang = documentLanguage(lang);
    const [notice, setNotice] = useState<ApiConsentNotice | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setNotice(null);
        setError(null);
        api.consentNotice(docLang)
            .then((data) => {
                if (!cancelled) setNotice(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof ApiError ? err.message : t('notice.loadFailed'),
                    );
                }
            });
        return () => {
            cancelled = true;
        };
    // `t` is a new closure every render; re-fetching on every language
    // change would refetch the SAME English/Tamil document `docLang` already
    // reacts to, so this only needs to depend on `docLang` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docLang]);

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
