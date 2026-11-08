import React, { useEffect } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

/**
 * SwapNgo's inline loading indicator — a clean rotating ring (track + one
 * highlighted arc), matching apps/web/src/components/common/Spinner.tsx
 * exactly (same viewBox, radius, stroke width and arc path) so the brand's
 * loading indicator looks identical on both apps. Drop-in replacement for
 * ActivityIndicator.
 *
 * react-native-svg + reanimated only — both already app dependencies, so
 * this adds nothing to bundle size (the exact goal of the size-optimization
 * pass — no Lottie, no new native module).
 *
 * The rotation is a style transform on a wrapping Animated.View, NOT an
 * animated `rotation` prop on an SVG <G>. The native SVG group only accepts a
 * precomputed `matrix`; react-native-svg turns `rotation`/`origin` into it
 * during the JS render, which reanimated's animatedProps bypass — so on
 * Android/iOS the ring never moved (it only spun on the web build).
 */
export const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = COLORS.primary }) => {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin]);

  const rotateStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <Animated.View style={[{ width: size, height: size }, rotateStyle]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9.5" stroke={color} strokeOpacity={0.15} strokeWidth={2.25} fill="none" />
        <Path
          d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
          stroke={color}
          strokeWidth={2.25}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
};
