import React, { useEffect } from 'react';
import Svg, { Circle, Path, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

const AnimatedG = Animated.createAnimatedComponent(G);

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
 */
export const Spinner: React.FC<{ size?: number; color?: string }> = ({ size = 24, color = COLORS.primary }) => {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
  }, [spin]);

  const rotateProps = useAnimatedProps(() => ({ rotation: spin.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <AnimatedG animatedProps={rotateProps} origin="12, 12">
        <Circle cx="12" cy="12" r="9.5" stroke={color} strokeOpacity={0.15} strokeWidth={2.25} fill="none" />
        <Path
          d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
          stroke={color}
          strokeWidth={2.25}
          strokeLinecap="round"
          fill="none"
        />
      </AnimatedG>
    </Svg>
  );
};
