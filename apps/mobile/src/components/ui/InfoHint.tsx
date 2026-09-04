import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { Sheet } from './Sheet';
import { COLORS } from '../../constants/theme';

export interface InfoHintSection {
  heading: string;
  body: string;
}

interface InfoHintProps {
  /** Sheet heading. Also the icon's accessibility label, so it must read as a question a rider would ask. */
  title: string;
  sections: InfoHintSection[];
  /** Optional worked example, rendered as a tinted block under the sections. One string per line. */
  example?: string[];
  /** Match the surrounding text colour so the icon reads as part of the line it sits on. */
  color?: string;
  size?: number;
}

/**
 * A tappable ⓘ that opens the app's bottom sheet with a short explainer.
 *
 * For rules a rider is entitled to check but that would bury the screen if
 * spelled out inline — chiefly how the overdue late fee counts days, which is
 * genuinely non-obvious (renewing and returning on the SAME date are priced
 * one day apart, on purpose). The alternative to this is a rider seeing two
 * different day counts on two screens and concluding one of them is a bug.
 *
 * Content comes from constants/ modules, never inline strings — see
 * constants/lateFeePolicy.ts for why.
 */
export const InfoHint: React.FC<InfoHintProps> = ({
  title, sections, example, color = COLORS.textSecondary, size = 14,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint="Opens an explanation"
        // Generous slop: the icon is deliberately small so it does not compete
        // with the warning it annotates, but a 14px tap target is not a target.
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="ml-1.5"
      >
        <Info size={size} color={color} />
      </TouchableOpacity>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <ScrollView
          className="px-6 pt-2"
          contentContainerStyle={{ paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section) => (
            <View key={section.heading} className="mb-4">
              <Text style={{ color: COLORS.textPrimary }} className="text-xs font-extrabold mb-1">
                {section.heading}
              </Text>
              <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium leading-relaxed">
                {section.body}
              </Text>
            </View>
          ))}

          {example?.length ? (
            <View
              className="rounded-2xl p-3.5 mb-2"
              style={{ backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }}
            >
              {example.map((line, i) => (
                <Text
                  key={line}
                  style={{ color: i === 0 ? COLORS.textPrimary : COLORS.textSecondary }}
                  className={`text-xs leading-relaxed ${i === 0 ? 'font-extrabold mb-1' : 'font-medium'}`}
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </Sheet>
    </>
  );
};
