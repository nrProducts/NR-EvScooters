import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Spinner } from '../components/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from '../components/AppShell';
import { Markdown } from '../components/Markdown';
import { COLORS } from '../constants/theme';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useT, useLangStore } from '../i18n';
import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import type { ApiLegalDocument, ApiLegalAcceptanceState } from '../types/api';

/**
 * The Terms & Conditions, rendered from the API rather than the app bundle.
 *
 * Same indirection, and the same two reasons, as app/privacy/notice.tsx: a
 * corrected document must reach riders without an app-store release, and
 * legal_acceptances.document_version has to resolve to the exact words the
 * rider saw, years later, in a dispute over a late fee or a damage charge.
 *
 * This screen is READ-ONLY. Acceptance happens once, on the consent screen
 * during signup, and again only when a new version is published. A rider
 * re-reading the terms from their profile is not re-accepting them, so there
 * is deliberately no button here — only a note telling them which version
 * they accepted and when.
 */
export default function TermsScreen() {
    const insets = useSafeAreaInsets();
    const { t } = useT();
    const lang = useLangStore((s) => s.lang);
    const [doc, setDoc] = useState<ApiLegalDocument | null>(null);
    const [state, setState] = useState<ApiLegalAcceptanceState | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setDoc(null);
        setError(null);

        api.termsDocument(lang)
            .then((data) => {
                if (!cancelled) setDoc(data);
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err instanceof ApiError ? err.message : 'Could not load the terms.',
                    );
                }
            });

        // The acceptance line is supporting detail, not the screen's purpose.
        // A rider must still be able to READ the terms if this call fails, so
        // it is deliberately not allowed to set `error`.
        api.myTermsState()
            .then((data) => {
                if (!cancelled) setState(data);
            })
            .catch(() => {
                if (!cancelled) setState(null);
            });

        return () => {
            cancelled = true;
        };
    }, [lang]);

    return (
        <AppShell title={t('terms.title')}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
                <LanguageToggle label={t('lang.label')} />

                {error ? (
                    <Text style={{ color: COLORS.danger }} className="text-xs font-semibold">
                        {error}
                    </Text>
                ) : !doc ? (
                    <Spinner size={18} color={COLORS.primary} />
                ) : (
                    <>
                        <Text
                            style={{ color: COLORS.textSecondary }}
                            className="text-[10px] font-bold uppercase tracking-wider mb-1"
                        >
                            {t('terms.version', {
                                version: doc.version,
                                date: new Date(doc.effective_from).toLocaleDateString(),
                            })}
                        </Text>

                        {/*
                          * Shown only when the rider is reading a language we do
                          * not have a reviewed translation for. Silently serving
                          * English under a Tamil toggle would be worse than
                          * saying so: they would not know to ask for help.
                          */}
                        {lang !== doc.language ? (
                            <Text
                                style={{ color: COLORS.textSecondary }}
                                className="text-[10px] font-semibold mb-2"
                            >
                                {t('terms.englishOnly')}
                            </Text>
                        ) : null}

                        {state?.accepted_version ? (
                            <View
                                className="rounded-2xl border p-3 mb-4"
                                style={{
                                    borderColor: COLORS.border,
                                    backgroundColor: COLORS.card,
                                }}
                            >
                                <Text
                                    style={{ color: COLORS.textSecondary }}
                                    className="text-[11px] font-semibold"
                                >
                                    {t('terms.acceptedOn', {
                                        version: state.accepted_version,
                                        date: state.accepted_at
                                            ? new Date(state.accepted_at).toLocaleDateString()
                                            : '',
                                    })}
                                </Text>
                            </View>
                        ) : (
                            <View className="mb-4" />
                        )}

                        <Markdown body={doc.body} />
                    </>
                )}
            </ScrollView>
        </AppShell>
    );
}
