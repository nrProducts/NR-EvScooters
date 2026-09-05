import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, ChevronLeft, Globe } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { LanguageOptionList } from '../i18n/LanguageOptionList';
import { useLangStore, useT } from '../i18n';
import type { Lang } from '../i18n';

/**
 * One screen, two entry points.
 *
 *  - FIRST LAUNCH. The routing gate in _layout.tsx sends every device here
 *    before onboarding, until the rider has actually picked something
 *    (`chosen`). It is the first screen of the app, so it has no back button
 *    and no header chrome — there is nothing behind it to go back to.
 *
 *  - SETTINGS (`?settings=1`). Reached from the Profile menu. Has a back
 *    button, a "Done" action, and applies each tap immediately so the rider
 *    watches the screen they are standing on change language — which is the
 *    only unambiguous confirmation that the control did what they wanted.
 *
 * In both cases the tap applies the language THEN, not on Continue. The
 * button below is navigation, not a commit: making the rider press Continue
 * to find out whether they picked the right row is exactly backwards when
 * they may not be able to read the row they are on.
 *
 * ── Layout ──────────────────────────────────────────────────────────────
 *
 * The Done/Continue action is a SIBLING of the ScrollView, not a flex-1
 * spacer pushed to the bottom INSIDE it. That combination — a ScrollView
 * whose content container is asked to flexGrow while one of its children is
 * also asked to flex-1 and absorb the leftover space — does not reliably
 * settle to the same place on Android and iOS, and on a short device (or with
 * the OS font scaled up) it could push the button below the visible area
 * entirely, behind the gesture bar. Pinning the button to a fixed footer
 * outside the ScrollView, sized by its own content and padded by the real
 * bottom safe-area inset, is the same pattern the sticky checkout bar in
 * booking/[modelId].tsx uses, and behaves the same everywhere.
 */
export default function LanguageScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ settings?: string }>();
    const isSettings = params.settings === '1';

    const { t } = useT();
    const lang = useLangStore((s) => s.lang);
    const setLang = useLangStore((s) => s.setLang);
    const chosen = useLangStore((s) => s.chosen);

    // Mirrors the store so the radio responds on the same frame as the tap,
    // rather than waiting for the store round-trip on a slow device.
    const [selected, setSelected] = useState<Lang>(lang);

    const pick = (next: Lang) => {
        setSelected(next);
        // Persists locally and, when signed in, pushes to the profile. Neither
        // blocks this call — see setLang in src/i18n/index.ts.
        setLang(next);
    };

    const finish = () => {
        if (isSettings) {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/profile');
            return;
        }
        // First launch. The gate in _layout.tsx now sees `chosen` and routes
        // onward on its own (onboarding, or straight into the app for a
        // reinstall that kept its session) — replace() rather than push()
        // so this screen leaves the stack for good.
        router.replace('/');
    };

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 24 }}
                style={{ backgroundColor: COLORS.background }}
            >
                <View className="px-6" style={{ paddingTop: isSettings ? 56 : 80 }}>
                    {isSettings ? (
                        <TouchableOpacity
                            onPress={finish}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.back')}
                            className="flex-row items-center mb-6 -ml-2"
                            style={{ minHeight: 44 }}
                        >
                            <ChevronLeft size={22} color={COLORS.textPrimary} />
                            <Text style={{ color: COLORS.textPrimary }} className="text-sm font-bold ml-1">
                                {t('common.back')}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View className="items-center mb-6">
                            <View
                                className="w-20 h-20 rounded-3xl items-center justify-center"
                                style={{ backgroundColor: COLORS.primary + '14' }}
                            >
                                <Globe size={36} color={COLORS.primary} />
                            </View>
                        </View>
                    )}

                    {/*
                      The title is translated like everything else, which means on
                      first launch it is shown in the guessed device language. The
                      rows below it are not translated at all, so a rider who
                      cannot read the title can still read their own language and
                      tap it — the screen works even when its own heading fails.
                    */}
                    <Text
                        style={{ color: COLORS.textPrimary, lineHeight: 34 }}
                        className={`text-2xl font-black mb-2 ${isSettings ? '' : 'text-center'}`}
                    >
                        {t(isSettings ? 'language.settingsTitle' : 'language.title')}
                    </Text>
                    <Text
                        style={{ color: COLORS.textSecondary, lineHeight: 20 }}
                        className={`text-sm font-medium mb-7 ${isSettings ? '' : 'text-center'}`}
                    >
                        {t('language.subtitle')}
                    </Text>

                    <LanguageOptionList value={selected} onChange={pick} />
                </View>
            </ScrollView>

            {/* Fixed footer — see the layout note above for why this lives
                outside the ScrollView instead of being pushed down by a
                flex-1 spacer within it. */}
            <View
                className="px-6"
                style={{ paddingTop: 12, paddingBottom: Math.max(24, insets.bottom + 20) }}
            >
                <TouchableOpacity
                    onPress={finish}
                    accessibilityRole="button"
                    style={{ backgroundColor: COLORS.primary }}
                    className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
                >
                    <Text className="text-white font-bold text-base mr-2">
                        {t(isSettings ? 'language.done' : 'language.continue')}
                    </Text>
                    {isSettings ? null : <ArrowRight size={18} color={COLORS.white} />}
                </TouchableOpacity>

                {/* Only worth saying where the rider has not yet been told
                    anything about the app — in Settings it is noise. */}
                {!isSettings && !chosen ? (
                    <Text
                        style={{ color: COLORS.textSecondary, lineHeight: 16 }}
                        className="text-[11px] font-medium text-center mt-4"
                    >
                        {t('language.offlineNote')}
                    </Text>
                ) : null}
            </View>
        </View>
    );
}
