import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useT } from './index';
import { LANGS, LANG_ACCESSIBLE_NAMES, LANG_LABELS, type Lang } from './types';

/**
 * The language rows, shared by the first-launch picker (src/app/language.tsx)
 * and the Settings entry point that reuses the same screen.
 *
 * Two rules the design is built around:
 *
 *  - Every option is written IN ITS OWN LANGUAGE and never translated. A
 *    rider who only reads Tamil has to be able to find Tamil, and cannot if
 *    the row says "Tamil".
 *
 *  - No flags. A flag names a country; Tamil and Hindi are not countries, and
 *    an Indian flag against Hindi says something about the other two that is
 *    not ours to say.
 *
 * The accessibility label is the English name plus its selected state
 * ("Tamil, selected"), because TalkBack reads with the phone's TTS voice —
 * an endonym in a script that voice is not configured for is announced as
 * silence.
 */
export function LanguageOptionList({
    value,
    onChange,
}: {
    value: Lang;
    onChange: (lang: Lang) => void;
}) {
    const { t } = useT();

    return (
        <View
            className="rounded-2xl border overflow-hidden"
            style={{
                backgroundColor: COLORS.card,
                borderColor: COLORS.border,
                shadowColor: COLORS.black,
                shadowOpacity: 0.03,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 3 },
                elevation: 1,
            }}
        >
            {LANGS.map((lang, index) => {
                const selected = lang === value;
                return (
                    <TouchableOpacity
                        key={lang}
                        onPress={() => onChange(lang)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, checked: selected }}
                        accessibilityLabel={t(
                            selected ? 'language.a11y.selected' : 'language.a11y.notSelected',
                            { language: LANG_ACCESSIBLE_NAMES[lang] },
                        )}
                        accessibilityHint={t('language.a11y.hint')}
                        // 60pt of row, comfortably past both platforms'
                        // 44pt minimum — this is the one control a rider who
                        // cannot read the current language has to be able to
                        // hit on the first try.
                        className="flex-row items-center px-4"
                        style={{
                            minHeight: 60,
                            backgroundColor: selected ? COLORS.primary + '0F' : COLORS.card,
                            ...(index > 0 ? { borderTopWidth: 1, borderTopColor: COLORS.border } : {}),
                        }}
                    >
                        <View
                            className="w-6 h-6 rounded-full items-center justify-center mr-3.5 border-2"
                            style={{
                                borderColor: selected ? COLORS.primary : COLORS.border,
                                backgroundColor: selected ? COLORS.primary : 'transparent',
                            }}
                        >
                            {selected ? <Check size={13} color={COLORS.white} strokeWidth={3} /> : null}
                        </View>
                        <Text
                            // Tamil and Devanagari glyphs carry more vertical
                            // detail than Latin at the same point size; the
                            // explicit lineHeight stops the descenders and the
                            // Devanagari headline being clipped by the row.
                            style={{
                                color: selected ? COLORS.primaryPressed : COLORS.textPrimary,
                                lineHeight: 26,
                            }}
                            className="text-base font-bold flex-1"
                        >
                            {LANG_LABELS[lang]}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
