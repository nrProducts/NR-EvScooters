import React, { useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { isDarkScheme } from '../../constants/theme';

/**
 * The brand green as a light-to-dark MIX instead of a flat fill: the same
 * diagonal gradient (#3CCB73 -> #17924A) as the admin's Net revenue card. Drop it
 * as the FIRST child of anything that used to be `backgroundColor: COLORS.primary`
 * (a button, a pill, the active tab disc). It paints behind the siblings that
 * follow it and does not take part in layout.
 *
 * The parent must clip its children (`overflow: 'hidden'`) so the gradient takes
 * the parent's rounded corners; the parent keeps its flat `backgroundColor` as the
 * fallback. react-native-svg is already in the app, so this needs no native module.
 *
 * Native: the Svg is sized in exact pixels from onLayout and REMOUNTED (keyed on
 * the size) whenever the parent's size changes. On Android, react-native-svg's
 * SvgView caches its rendered bitmap and does not reliably redraw it when the
 * view is resized after its first paint (a button or header that grows once
 * fonts, styles or content settle). The stale, smaller bitmap was drawn at the
 * top-left over the flat fallback — a lighter gradient box with a hard edge
 * (half a "Send Code" button, a strip across the login header). Neither
 * `width="100%"` nor a `viewBox` alone fixed it; a fresh SvgView at the final
 * size always paints correctly. Until the first layout only the flat fallback
 * shows.
 *
 * Mirrored on the web in index.css (`.bg-primary`, and `.dark` --brand-from /
 * --brand-to for the dark theme) — keep the stops in sync.
 */
const GRADIENT_GREEN = { from: '#3CCB73', to: '#17924A' } as const;
// Dark theme: the deeper emerald the admin console uses, which keeps white
// text on it readable against the near-black ground.
const GRADIENT_GREEN_DARK = { from: '#1E9A52', to: '#0B5A2D' } as const;

// zIndex -1: on the web build a positioned element paints over un-positioned siblings whatever
// the order, and an SVG icon (lucide) is not positioned — so the gradient covered the active
// tab's icon and the arrow on buttons. Behind its parent's stacking context it can't.
const FILL_STYLE = [StyleSheet.absoluteFill, { zIndex: -1 }];

export const GradientFill: React.FC = () => {
  const stops = isDarkScheme() ? GRADIENT_GREEN_DARK : GRADIENT_GREEN;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const gradient = (
    <>
      <Defs>
        <LinearGradient id="sngGreen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={stops.from} />
          <Stop offset="1" stopColor={stops.to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill="url(#sngGreen)" />
    </>
  );

  // The browser resizes SVGs correctly, so the web keeps the plain stretched fill.
  if (Platform.OS === 'web') {
    return (
      <Svg style={FILL_STYLE} width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none" pointerEvents="none">
        {gradient}
      </Svg>
    );
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <View style={FILL_STYLE} pointerEvents="none" onLayout={onLayout}>
      {size && size.width > 0 && size.height > 0 ? (
        <Svg
          key={`${size.width}x${size.height}`}
          width={size.width}
          height={size.height}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {gradient}
        </Svg>
      ) : null}
    </View>
  );
};
