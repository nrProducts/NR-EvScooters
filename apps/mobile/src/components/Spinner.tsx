import React, { useEffect } from 'react';
import Svg, { Circle, Line, G } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * SwapNgo's inline loading indicator — a continuously spinning scooter wheel,
 * the same wheel drawn in SplashAnimation.tsx, extracted to a small reusable
 * size for anywhere an ActivityIndicator would otherwise sit.
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

  const wheelProps = useAnimatedProps(() => ({ rotation: spin.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <AnimatedG animatedProps={wheelProps} origin="12, 12">
        <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={2} fill="none" />
        <Line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth={1.4} strokeOpacity={0.6} />
        <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={1.4} strokeOpacity={0.6} />
        <Line x1="6.5" y1="6.5" x2="17.5" y2="17.5" stroke={color} strokeWidth={1.4} strokeOpacity={0.6} />
        <Line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke={color} strokeWidth={1.4} strokeOpacity={0.6} />
        <Circle cx="12" cy="12" r="2" fill={color} />
      </AnimatedG>
    </Svg>
  );
};
