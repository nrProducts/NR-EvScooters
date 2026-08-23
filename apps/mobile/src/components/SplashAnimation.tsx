import React, { useEffect } from 'react';
import { View, Image, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, G } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withDelay, Easing,
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCOOTER_WIDTH = Math.min(180, SCREEN_WIDTH * 0.45);
const SCOOTER_HEIGHT = SCOOTER_WIDTH * (120 / 180);

/**
 * A lightweight scooter-ride-in animation shown while the app reads back the
 * session (initialising || !onboardingHydrated in _layout.tsx). It rides on
 * top of that existing gate rather than adding its own delay — as soon as the
 * gate clears, this unmounts with whatever screen replaces it.
 *
 * Built with react-native-svg + reanimated only — both already dependencies
 * elsewhere in the app, so this adds nothing new to the bundle.
 */
export const SplashAnimation: React.FC = () => {
  const scooterX = useSharedValue(-SCOOTER_WIDTH - 40);
  const wheelSpin = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkY = useSharedValue(8);

  useEffect(() => {
    scooterX.value = withTiming((SCREEN_WIDTH - SCOOTER_WIDTH) / 2, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
    wheelSpin.value = withTiming(360 * 2, { duration: 700, easing: Easing.linear });
    wordmarkOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    wordmarkY.value = withDelay(500, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, [scooterX, wheelSpin, wordmarkOpacity, wordmarkY]);

  const scooterStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scooterX.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));

  const rearWheelProps = useAnimatedProps(() => ({
    rotation: wheelSpin.value,
  }));
  const frontWheelProps = useAnimatedProps(() => ({
    rotation: wheelSpin.value,
  }));

  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: COLORS.background }}>
      <View style={{ height: SCOOTER_HEIGHT + 40, width: SCREEN_WIDTH, justifyContent: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: SCOOTER_WIDTH, height: SCOOTER_HEIGHT }, scooterStyle]}>
          <Svg width={SCOOTER_WIDTH} height={SCOOTER_HEIGHT} viewBox="0 0 180 120">
            {/* Motion lines, trailing the scooter to sell the sense of motion. */}
            <Line x1="0" y1="70" x2="28" y2="70" stroke={COLORS.border} strokeWidth={3} strokeLinecap="round" />
            <Line x1="6" y1="82" x2="26" y2="82" stroke={COLORS.border} strokeWidth={3} strokeLinecap="round" />

            {/* Body */}
            <Path
              d="M40 95 L40 60 Q40 50 55 50 L95 50 Q100 40 112 40 L128 40"
              stroke={COLORS.primary}
              strokeWidth={6}
              strokeLinecap="round"
              fill="none"
            />
            {/* Handlebar */}
            <Path d="M128 40 L128 55" stroke={COLORS.primary} strokeWidth={6} strokeLinecap="round" />
            <Path d="M118 55 L138 55" stroke={COLORS.primary} strokeWidth={6} strokeLinecap="round" />
            {/* Seat */}
            <Path d="M55 50 L70 50" stroke={COLORS.primary} strokeWidth={8} strokeLinecap="round" />
            {/* Footboard */}
            <Path d="M45 92 L100 92" stroke={COLORS.primary} strokeWidth={6} strokeLinecap="round" />

            {/* Rear wheel — origin pins the rotation to the wheel's own center. */}
            <AnimatedG animatedProps={rearWheelProps} origin="45, 95">
              <Circle cx="45" cy="95" r="18" stroke={COLORS.textPrimary} strokeWidth={5} fill={COLORS.card} />
              <Line x1="45" y1="80" x2="45" y2="110" stroke={COLORS.border} strokeWidth={2} />
              <Line x1="30" y1="95" x2="60" y2="95" stroke={COLORS.border} strokeWidth={2} />
            </AnimatedG>

            {/* Front wheel */}
            <AnimatedG animatedProps={frontWheelProps} origin="128, 95">
              <Circle cx="128" cy="95" r="18" stroke={COLORS.textPrimary} strokeWidth={5} fill={COLORS.card} />
              <Line x1="128" y1="80" x2="128" y2="110" stroke={COLORS.border} strokeWidth={2} />
              <Line x1="113" y1="95" x2="143" y2="95" stroke={COLORS.border} strokeWidth={2} />
            </AnimatedG>
          </Svg>
        </Animated.View>
      </View>

      <Animated.View style={wordmarkStyle}>
        <Image
          source={require('../../assets/images/logo-lockup.png')}
          accessibilityLabel="Swapngo — Swap. Ride. Go Green."
          className="w-60 h-16"
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
};
