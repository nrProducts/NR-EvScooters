import React from 'react';
import { StyleSheet } from 'react-native';
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
 * The geometry is a unit square stretched by `viewBox="0 0 1 1"` +
 * `preserveAspectRatio="none"`, NOT `width="100%"` on the Rect. On Android,
 * react-native-svg resolves a child's percentage size once, caches the path, and
 * does not drop that cache when the Svg view is resized (SvgView.onSizeChanged
 * only rebuilds the bitmap). A button that grows after its first paint (styles,
 * fonts or content settling) then kept the gradient at the old size, painting a
 * smaller gradient box with a hard edge over the flat fallback. The viewBox
 * transform is recomputed from the current size on every draw, so the
 * unit-square path never goes stale.
 *
 * Mirrored on the web in index.css (`.bg-primary`, and `.dark` --brand-from /
 * --brand-to for the dark theme) — keep the stops in sync.
 */
const GRADIENT_GREEN = { from: '#3CCB73', to: '#17924A' } as const;
// Dark theme: the deeper emerald the admin console uses, which keeps white
// text on it readable against the near-black ground.
const GRADIENT_GREEN_DARK = { from: '#1E9A52', to: '#0B5A2D' } as const;

export const GradientFill: React.FC = () => {
  const stops = isDarkScheme() ? GRADIENT_GREEN_DARK : GRADIENT_GREEN;
  return (
    <Svg
      // zIndex -1: on the web build a positioned element paints over un-positioned siblings whatever
      // the order, and an SVG icon (lucide) is not positioned — so the gradient covered the active
      // tab's icon and the arrow on buttons. Behind its parent's stacking context it can't.
      style={[StyleSheet.absoluteFill, { zIndex: -1 }]}
      width="100%"
      height="100%"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="sngGreen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={stops.from} />
          <Stop offset="1" stopColor={stops.to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="1" height="1" fill="url(#sngGreen)" />
    </Svg>
  );
};
