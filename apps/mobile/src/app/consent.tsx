import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Spinner } from '../components/Spinner';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, ChevronDown, ChevronUp, ChevronRight, FileText, Lock } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { ConsentToggle } from '../components/ui/ConsentToggle';
import { CheckRow } from '../components/ui/CheckRow';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useT, useLangStore } from '../i18n';
import type { CopyKey } from '../i18n';
import { useConsent } from '../hooks/useConsent';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../lib/api';
import { ApiError } from '../lib/ApiError';
import type { ApiLegalDocument, ConsentPurpose } from '../types/api';

/**
 * Notice-and-consent capture (DPDPA ss.5-6), shown between profile setup and
 * the KYC wizard.
 *
 * It is also, with no extra code, the RE-CONSENT screen: the routing gate in
 * _layout.tsx sends the rider here whenever `up_to_date` is false, which
 * becomes true for everyone the moment a new notice version is published.
 */
export default function ConsentScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { next } = useLocalSearchParams<{ next?: string }>();
    const { t } = useT();
    const hydrate = useLangStore((s) => s.hydrate);
    const langReady = useLangStore((s) => s.ready);
    const lang = useLangStore((s) => s.lang);

    const { state, notice, loading, saving, error, save } = useConsent();
    const refreshProfile = useAuthStore((s) => s.refreshProfile);
    const [optional, setOptional] = useState<Record<string, boolean>>({});
    const [expanded, setExpanded] = useState<string | null>(null);
    const [declared, setDeclared] = useState(false);

    // --- Terms & Conditions ------------------------------------------------
    // Fetched here rather than through useConsent: the Terms are a different
    // document with a different lifecycle, and folding them into the consent
    // hook would tie a re-consent prompt to a terms revision and vice versa.
    const [terms, setTerms] = useState<ApiLegalDocument | null>(null);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    // The rider must OPEN the document before the agreement box will enable.
    // "I have read" should not be a claim the app invites without ever having
    // shown them anything — and this is the one screen where that claim is
    // later relied on to collect money.
    const [openedTerms, setOpenedTerms] = useState(false);
    const [termsError, setTermsError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.termsDocument(lang)
            .then((doc) => {
                if (cancelled) return;
                setTerms((prev) => {
                    // A language switch re-fetches the same version; only a
                    // genuinely different version should reset the rider's
                    // ticks, so switching language mid-signup does not quietly
                    // undo what they already did.
                    if (prev && prev.version !== doc.version) {
                        setAgreedToTerms(false);
                        setOpenedTerms(false);
                    }
                    return doc;
                });
            })
            .catch(() => {
                // Left null. The Continue button stays disabled below, so the
                // rider cannot proceed past terms we failed to load rather
                // than proceeding without accepting them.
                if (!cancelled) setTerms(null);
            });
        return () => {
            cancelled = true;
        };
    }, [lang]);

    useEffect(() => {
        if (!langReady) void hydrate();
    }, [langReady, hydrate]);

    // Seed the optional toggles from the server, so a rider who returns to
    // this screen sees what they actually chose last time. Anything the rider
    // has never decided stays OFF — never pre-ticked.
    useEffect(() => {
        if (!state) return;
        const seed: Record<string, boolean> = {};
        for (const item of state.items) {
            if (!item.required) seed[item.purpose] = item.granted;
        }
        setOptional(seed);
    }, [state]);

    const required = useMemo(
        () => state?.items.filter((i) => i.required) ?? [],
        [state],
    );
    const optionalItems = useMemo(
        () => state?.items.filter((i) => !i.required) ?? [],
        [state],
    );

    const accept = async () => {
        const grants = [
            ...required.map((i) => ({ purpose: i.purpose, granted: true })),
            ...optionalItems.map((i) => ({
                purpose: i.purpose,
                granted: optional[i.purpose] ?? false,
            })),
        ];
        const result = await save(grants);
        if (!result.ok) return;

        // Terms acceptance is recorded SECOND and separately, because it is a
        // separate legal act: consent above is the lawful basis for processing
        // data, this forms the rental contract.
        //
        // A failure here must not navigate on. Consent is already saved (and
        // is idempotent to re-save), so the rider lands back on this screen
        // with both boxes still ticked and can retry — far better than
        // reaching /kyc-intro having agreed to terms we never recorded, which
        // is precisely the state that makes a damage charge unenforceable.
        if (terms) {
            try {
                await api.acceptTerms({ version: terms.version, language: terms.language });
            } catch (err) {
                setTermsError(
                    err instanceof ApiError && err.status === 409
                        ? t('terms.stale')
                        : err instanceof ApiError
                          ? err.message
                          : t('consent.error'),
                );
                // A 409 means the document changed under them — re-fetch so
                // they are reading, and accepting, the version now live.
                if (err instanceof ApiError && err.status === 409) {
                    api.termsDocument(lang).then(setTerms).catch(() => {});
                    setAgreedToTerms(false);
                    setOpenedTerms(false);
                }
                return;
            }
        }

        // The routing gate in _layout.tsx decides whether to show this screen
        // from profile.consent_up_to_date, which is the CACHED profile in the
        // auth store — not the response we just got back. Navigating without
        // refreshing it first sends the rider to /kyc-intro, where the gate
        // immediately reads the stale `false` and bounces them straight back
        // here. Awaiting the refresh is what breaks that loop.
        //
        // Same reason kyc.tsx awaits refreshProfile() after submitting.
        await refreshProfile();

        router.replace((next as never) ?? ('/kyc-intro' as never));
    };

    if (loading || !state || !notice) {
        return (
            <View
                className="flex-1 items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
            >
                <Spinner size={18} color={COLORS.primary} />
                <Text style={{ color: COLORS.textSecondary }} className="text-xs font-semibold mt-3">
                    {t('common.loading')}
                </Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={{ backgroundColor: COLORS.background }}
            contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 32 }}
        >
            <View
                className="w-16 h-16 rounded-3xl items-center justify-center mb-5"
                style={{ backgroundColor: COLORS.primary + '14' }}
            >
                <ShieldCheck size={30} color={COLORS.primary} />
            </View>

            <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black mb-2">
                {t('consent.title')}
            </Text>
            <Text
                style={{ color: COLORS.textSecondary }}
                className="text-sm font-medium leading-relaxed mb-5"
            >
                {t('consent.subtitle')}
            </Text>

            <LanguageToggle label={t('lang.label')} />

            {/* --- Required, accepted together ------------------------------
                Deliberately NOT individual switches. A toggle that cannot be
                turned off presents itself as a choice and is not one; grouping
                them under one honest CTA is the less deceptive design. */}
            <SectionHeading
                icon={<Lock size={14} color={COLORS.textSecondary} />}
                title={t('consent.required.heading')}
                help={t('consent.required.help')}
            />

            <View
                className="rounded-2xl border mb-6"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
            >
                {required.map((item, index) => (
                    <PurposeRow
                        key={item.purpose}
                        purpose={item.purpose}
                        expanded={expanded === item.purpose}
                        onToggleExpand={() =>
                            setExpanded(expanded === item.purpose ? null : item.purpose)
                        }
                        isLast={index === required.length - 1}
                    />
                ))}
            </View>

            {/* --- Optional, all default OFF ------------------------------- */}
            <SectionHeading
                title={t('consent.optional.heading')}
                help={t('consent.optional.help')}
            />

            {optionalItems.map((item) => (
                <ConsentToggle
                    key={item.purpose}
                    title={t(`purpose.${item.purpose}.title` as CopyKey)}
                    summary={t(`purpose.${item.purpose}.summary` as CopyKey)}
                    value={optional[item.purpose] ?? false}
                    onChange={(v) => setOptional((prev) => ({ ...prev, [item.purpose]: v }))}
                    disabled={saving}
                />
            ))}

            <TouchableOpacity
                onPress={() => router.push('/privacy/notice' as never)}
                accessibilityRole="link"
                className="flex-row items-center py-4"
            >
                <FileText size={16} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary }} className="text-xs font-bold ml-2">
                    {t('consent.readNotice')}
                </Text>
            </TouchableOpacity>

            <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-semibold mb-5">
                {t('consent.version', {
                    version: notice.version,
                    date: new Date(notice.effective_from).toLocaleDateString(),
                })}
            </Text>

            {error ? (
                <View
                    className="rounded-2xl border p-3.5 mb-4"
                    style={{ borderColor: COLORS.danger, backgroundColor: COLORS.danger + '10' }}
                >
                    <Text style={{ color: COLORS.danger }} className="text-xs font-semibold">
                        {error}
                    </Text>
                </View>
            ) : null}

            <View className="mb-4">
                <CheckRow
                    checked={declared}
                    onToggle={() => setDeclared((v) => !v)}
                    text={t('consent.confirmDeclaration')}
                    disabled={saving}
                />
            </View>

            {/*
              * Terms & Conditions — a second, separate legal act.
              *
              * Kept visually distinct from the privacy block above rather than
              * merged into one "I agree to everything" tick, because they are
              * different agreements with different consequences: one governs
              * data, the other governs money. A rider disputing a damage
              * charge should be able to point at the box that was about the
              * damage charge.
              */}
            <View
                className="rounded-2xl border p-4 mb-4"
                style={{ borderColor: COLORS.border, backgroundColor: COLORS.card }}
            >
                <TouchableOpacity
                    onPress={() => {
                        setOpenedTerms(true);
                        router.push('/terms' as never);
                    }}
                    accessibilityRole="link"
                    className="flex-row items-center mb-3"
                >
                    <FileText size={16} color={COLORS.primary} />
                    <Text style={{ color: COLORS.primary }} className="text-xs font-bold ml-2 flex-1">
                        {t('terms.readTerms')}
                    </Text>
                    <ChevronRight size={16} color={COLORS.primary} />
                </TouchableOpacity>

                <CheckRow
                    checked={agreedToTerms}
                    onToggle={() => setAgreedToTerms((v) => !v)}
                    text={t('terms.agree')}
                    // Disabled until they have opened the document, and while
                    // it has not loaded — never pre-checked.
                    disabled={saving || !openedTerms || !terms}
                />

                {!openedTerms ? (
                    <Text
                        style={{ color: COLORS.textSecondary }}
                        className="text-[10px] font-semibold mt-2 ml-8"
                    >
                        {t('terms.openFirst')}
                    </Text>
                ) : null}

                {terms ? (
                    <Text
                        style={{ color: COLORS.textSecondary }}
                        className="text-[10px] font-semibold mt-2 ml-8"
                    >
                        {t('terms.version', {
                            version: terms.version,
                            date: new Date(terms.effective_from).toLocaleDateString(),
                        })}
                    </Text>
                ) : null}
            </View>

            {termsError ? (
                <View
                    className="rounded-2xl border p-3.5 mb-4"
                    style={{ borderColor: COLORS.danger, backgroundColor: COLORS.danger + '10' }}
                >
                    <Text style={{ color: COLORS.danger }} className="text-xs font-semibold">
                        {termsError}
                    </Text>
                </View>
            ) : null}

            <TouchableOpacity
                onPress={() => void accept()}
                disabled={saving || !declared || !agreedToTerms || !terms}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving || !declared || !agreedToTerms || !terms }}
                style={{
                    backgroundColor: COLORS.primary,
                    opacity: saving || !declared || !agreedToTerms || !terms ? 0.5 : 1,
                }}
                className="w-full py-4 rounded-2xl flex-row justify-center items-center"
            >
                {saving ? (
                    <Spinner size={18} color="#FFF" />
                ) : (
                    <Text className="text-white font-bold text-base">{t('consent.accept')}</Text>
                )}
            </TouchableOpacity>
        </ScrollView>
    );
}

const SectionHeading: React.FC<{
    title: string;
    help: string;
    icon?: React.ReactNode;
}> = ({ title, help, icon }) => (
    <View className="mb-3">
        <View className="flex-row items-center mb-1.5">
            {icon ? <View className="mr-1.5">{icon}</View> : null}
            <Text
                style={{ color: COLORS.textSecondary }}
                className="text-[11px] font-bold uppercase tracking-wider"
            >
                {title}
            </Text>
        </View>
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium leading-relaxed">
            {help}
        </Text>
    </View>
);

/**
 * One required purpose, with a disclosure that answers the three questions
 * DPDPA s.5 actually requires a notice to answer: what, who else, how long.
 */
const PurposeRow: React.FC<{
    purpose: ConsentPurpose;
    expanded: boolean;
    onToggleExpand: () => void;
    isLast: boolean;
}> = ({ purpose, expanded, onToggleExpand, isLast }) => {
    const { t } = useT();
    return (
        <View
            className="p-3.5"
            style={isLast ? undefined : { borderBottomWidth: 1, borderBottomColor: COLORS.border }}
        >
            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold mb-1">
                {t(`purpose.${purpose}.title` as CopyKey)}
            </Text>
            <Text
                style={{ color: COLORS.textSecondary }}
                className="text-[11px] font-medium leading-relaxed"
            >
                {t(`purpose.${purpose}.summary` as CopyKey)}
            </Text>

            <TouchableOpacity
                onPress={onToggleExpand}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                className="flex-row items-center mt-2.5"
            >
                <Text style={{ color: COLORS.primary }} className="text-[11px] font-bold mr-1">
                    {expanded ? t('consent.collapse') : t('consent.expand')}
                </Text>
                {expanded ? (
                    <ChevronUp size={13} color={COLORS.primary} />
                ) : (
                    <ChevronDown size={13} color={COLORS.primary} />
                )}
            </TouchableOpacity>

            {expanded ? (
                <View className="mt-3" style={{ gap: 10 }}>
                    <Detail label={t('consent.detail.collect')} value={t(`purpose.${purpose}.collect` as CopyKey)} />
                    <Detail label={t('consent.detail.shared')} value={t(`purpose.${purpose}.shared` as CopyKey)} />
                    <Detail label={t('consent.detail.retention')} value={t(`purpose.${purpose}.retention` as CopyKey)} />
                </View>
            ) : null}
        </View>
    );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View>
        <Text
            style={{ color: COLORS.textSecondary }}
            className="text-[10px] font-bold uppercase tracking-wider mb-0.5"
        >
            {label}
        </Text>
        <Text style={{ color: COLORS.textPrimary }} className="text-[11px] font-medium leading-relaxed">
            {value}
        </Text>
    </View>
);
