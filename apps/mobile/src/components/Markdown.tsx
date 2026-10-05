import React from 'react';
import { View, Text } from 'react-native';
import { COLORS } from '../constants/theme';

/**
 * Minimal Markdown renderer for legal copy served from the API.
 *
 * Lifted out of app/privacy/notice.tsx, which had it privately, once the
 * Terms & Conditions screen needed the same thing. Two screens rendering
 * database-authored legal text with two different renderers is how the same
 * clause ends up looking authoritative in one place and broken in the other.
 *
 * Deliberately NOT a dependency. The documents use headings, paragraphs,
 * bullets, numbered lists and bold; a full Markdown engine is several hundred
 * KB of bundle for that. The original carried a note saying to revisit rather
 * than quietly extend it if tables or links were ever needed — so, revisiting
 * explicitly:
 *
 *   ADDED, because the Terms need them:
 *     - ordered lists ("1. "), for the numbered return process
 *     - real **bold**, rendered rather than stripped
 *
 *   STILL NOT SUPPORTED, deliberately:
 *     - tables. They do not fit a phone screen, so the Terms express every
 *       fee schedule as a bullet list instead. Do not add table syntax to a
 *       document and then add table support here to cope — fix the document.
 *     - links. Nothing in the legal copy should navigate the rider away
 *       mid-clause; cross-references name the screen in words instead.
 *
 * Bold is the significant change. The previous renderer STRIPPED it, which
 * for a privacy notice was cosmetic but for the Terms is not: "we retain
 * **100%**" and "we do **not** retain" are exactly the phrases emphasis is
 * carrying, and flattening them removes the signal a rider most needs.
 */
export const Markdown: React.FC<{ body: string }> = ({ body }) => {
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

                if (/^[-*]\s/.test(trimmed)) {
                    return (
                        <View key={i} className="mb-2">
                            {trimmed.split('\n').map((line, j) => (
                                <View key={j} className="flex-row mb-1">
                                    <Text
                                        style={{ color: COLORS.textSecondary }}
                                        className="text-sm mr-2"
                                    >
                                        •
                                    </Text>
                                    <Text
                                        style={{ color: COLORS.textPrimary }}
                                        className="text-[13px] font-medium leading-relaxed flex-1"
                                    >
                                        <Inline text={line.replace(/^[-*]\s+/, '')} />
                                    </Text>
                                </View>
                            ))}
                        </View>
                    );
                }

                // Ordered list. The marker is the SOURCE number rather than the
                // array index, so a document that starts at 1. and continues
                // across a paragraph break still numbers correctly.
                if (/^\d+\.\s/.test(trimmed)) {
                    return (
                        <View key={i} className="mb-2">
                            {trimmed.split('\n').map((line, j) => {
                                const match = line.match(/^(\d+)\.\s+(.*)$/);
                                if (!match) return null;
                                return (
                                    <View key={j} className="flex-row mb-1">
                                        <Text
                                            style={{ color: COLORS.textSecondary }}
                                            className="text-[13px] font-bold mr-2"
                                        >
                                            {match[1]}.
                                        </Text>
                                        <Text
                                            style={{ color: COLORS.textPrimary }}
                                            className="text-[13px] font-medium leading-relaxed flex-1"
                                        >
                                            <Inline text={match[2]!} />
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    );
                }

                return (
                    <Text
                        key={i}
                        style={{ color: COLORS.textPrimary }}
                        className="text-[13px] font-medium leading-relaxed mb-3"
                    >
                        <Inline text={trimmed.replace(/\n/g, ' ')} />
                    </Text>
                );
            })}
        </View>
    );
};

/**
 * Renders **bold** runs as nested <Text>, which is the only way React Native
 * does inline styling — a nested Text inherits the parent's layout and only
 * overrides what it sets.
 *
 * The split keeps the delimiters via a capture group, so odd indices are the
 * bold runs and even indices the plain ones. An unmatched `**` therefore
 * degrades to literal text rather than swallowing the rest of the paragraph,
 * which is the failure mode that matters for copy nobody can hot-fix.
 */
const Inline: React.FC<{ text: string }> = ({ text }) => {
    const parts = text.split(/\*\*(.+?)\*\*/g);
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <Text key={i} className="font-black" style={{ color: COLORS.textPrimary }}>
                        {part}
                    </Text>
                ) : (
                    part
                ),
            )}
        </>
    );
};
