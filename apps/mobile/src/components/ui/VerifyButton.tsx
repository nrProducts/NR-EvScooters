import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { GradientFill } from './GradientFill';
import { Spinner } from '../Spinner';

export type VerifyStatus = 'idle' | 'verifying' | 'success' | 'error';

const CIRCLE = 52;
const BOX_RADIUS = 16;

/**
 * The OTP screen's Verify button, which shows the check itself:
 *
 *   idle       a full-width green button reading "Verify"
 *   verifying  it shrinks into a small circle holding a spinner
 *   success    the circle shows a tick and a green ripple spreads out from it
 *   error      the button turns red and shakes, then the screen returns it to idle
 *
 * The rider's thumb is already on this button when the last digit lands, so the
 * progress is shown where they are looking instead of somewhere else on screen.
 * Presentation only — the screen decides the status and what a press does.
 */
export const VerifyButton: React.FC<{
  label: string;
  status: VerifyStatus;
  onPress: () => void;
}> = ({ label, status, onPress }) => {
  // The button animates between the container's full width and a circle, so it needs
  // that width as a number. Until it is measured the button simply fills the row.
  const [fullWidth, setFullWidth] = useState(0);

  const shrink = useSharedValue(0);     // 0 = full width, 1 = circle
  const shakeX = useSharedValue(0);
  const redOpacity = useSharedValue(0);
  const labelOpacity = useSharedValue(1);
  const spinnerOpacity = useSharedValue(0);
  const tickScale = useSharedValue(0);
  const ripple = useSharedValue(0);     // 0 = hidden, 1 = fully spread

  useEffect(() => {
    const collapsed = status === 'verifying' || status === 'success';
    shrink.value = withTiming(collapsed ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
    labelOpacity.value = withTiming(collapsed ? 0 : 1, { duration: 160 });
    spinnerOpacity.value = withTiming(status === 'verifying' ? 1 : 0, { duration: 160 });
    redOpacity.value = withTiming(status === 'error' ? 1 : 0, { duration: 180 });

    if (status === 'success') {
      tickScale.value = withSpring(1, { damping: 9, stiffness: 180 });
      ripple.value = 0;
      ripple.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) });
    } else {
      tickScale.value = withTiming(0, { duration: 120 });
      ripple.value = 0;
    }

    if (status === 'error') {
      shakeX.value = withSequence(
        withTiming(-9, { duration: 60 }),
        withTiming(8, { duration: 70 }),
        withTiming(-6, { duration: 70 }),
        withTiming(5, { duration: 70 }),
        withTiming(0, { duration: 60 }),
      );
    }
  }, [status, shrink, shakeX, redOpacity, labelOpacity, spinnerOpacity, tickScale, ripple]);

  const buttonStyle = useAnimatedStyle(() => ({
    width: fullWidth > 0 ? fullWidth - (fullWidth - CIRCLE) * shrink.value : '100%',
    borderRadius: BOX_RADIUS + (CIRCLE / 2 - BOX_RADIUS) * shrink.value,
    transform: [{ translateX: shakeX.value }],
  }));
  const redStyle = useAnimatedStyle(() => ({ opacity: redOpacity.value }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));
  const spinnerStyle = useAnimatedStyle(() => ({ opacity: spinnerOpacity.value }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: tickScale.value, transform: [{ scale: tickScale.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - ripple.value),
    transform: [{ scale: 1 + 1.6 * ripple.value }],
  }));

  const pressable = status === 'idle' || status === 'error';

  return (
    <View
      onLayout={(e) => setFullWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%', height: CIRCLE, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute', width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
            borderWidth: 2, borderColor: COLORS.primary,
          },
          rippleStyle,
        ]}
      />

      <Animated.View style={[{ height: CIRCLE, overflow: 'hidden', backgroundColor: COLORS.primary }, buttonStyle]}>
        <GradientFill />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.danger }, redStyle]} />
        <TouchableOpacity
          onPress={onPress}
          disabled={!pressable}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ busy: status === 'verifying', disabled: !pressable }}
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <Animated.View pointerEvents="none" style={labelStyle}>
            <Text className="text-white font-bold text-base">{label}</Text>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, spinnerStyle]}>
            <Spinner size={22} color="#FFF" />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, tickStyle]}>
            <Check size={26} color="#FFF" strokeWidth={3.2} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};
