import React, { useMemo, useRef, useEffect } from 'react';
import { Animated, PanResponder, View, Text, LayoutChangeEvent, StyleSheet } from 'react-native';
import { ChevronsRight } from 'lucide-react-native';
import { Spinner } from './Spinner';
import { COLORS } from '../constants/theme';

const THUMB_SIZE = 48;
const TRACK_PADDING = 4;
// Fraction of the available travel the thumb must cross before release counts
// as a confirm rather than a cancelled drag.
const CONFIRM_THRESHOLD = 0.72;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

interface SwipeToPayProps {
  /** Shown centered in the track, e.g. "Slide to pay ₹499". */
  label: string;
  /** Shown once the swipe has completed and payment is in flight. */
  processingLabel: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  /** Bump this (e.g. on payment failure) to snap the thumb back to the start. */
  resetSignal?: number;
}

/**
 * A real drag-to-confirm control (Swiggy/Zomato-style) — not a styled tap
 * button. Built on core RN Animated + PanResponder rather than
 * gesture-handler/reanimated's gesture API so it needs no root-level
 * provider and behaves identically on native and on the web build (RNW
 * maps PanResponder to pointer events on its own).
 */
export const SwipeToPay: React.FC<SwipeToPayProps> = ({
  label,
  processingLabel,
  busy = false,
  disabled = false,
  onConfirm,
  resetSignal = 0,
}) => {
  const [trackWidth, setTrackWidth] = React.useState(0);
  const pan = useRef(new Animated.Value(0)).current;
  const dragX = useRef(0);
  const confirmedRef = useRef(false);
  const maxDrag = Math.max(trackWidth - THUMB_SIZE - TRACK_PADDING * 2, 1);
  const locked = disabled || busy;

  useEffect(() => {
    if (resetSignal === 0) return;
    confirmedRef.current = false;
    dragX.current = 0;
    Animated.spring(pan, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !locked && !confirmedRef.current,
        onMoveShouldSetPanResponder: () => !locked && !confirmedRef.current,
        onPanResponderMove: (_evt, gesture) => {
          const next = clamp(dragX.current + gesture.dx, 0, maxDrag);
          pan.setValue(next);
        },
        onPanResponderRelease: (_evt, gesture) => {
          const next = clamp(dragX.current + gesture.dx, 0, maxDrag);
          if (maxDrag > 0 && next / maxDrag >= CONFIRM_THRESHOLD) {
            confirmedRef.current = true;
            dragX.current = maxDrag;
            Animated.timing(pan, { toValue: maxDrag, duration: 120, useNativeDriver: false }).start();
            onConfirm();
          } else {
            dragX.current = 0;
            Animated.spring(pan, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, maxDrag],
  );

  const fillWidth = Animated.add(pan, THUMB_SIZE + TRACK_PADDING);

  const handleLayout = (e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.track,
        {
          backgroundColor: COLORS.secondary + '55',
          borderColor: COLORS.border,
          opacity: locked && !busy ? 0.5 : 1,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.fill, { width: fillWidth, backgroundColor: COLORS.primary }]}
      />
      <Text style={styles.label} numberOfLines={1}>
        {busy ? processingLabel : label}
      </Text>
      <Animated.View
        {...(busy ? {} : panResponder.panHandlers)}
        style={[
          styles.thumb,
          {
            backgroundColor: COLORS.primary,
            transform: [{ translateX: pan }],
          },
        ]}
      >
        {busy ? <Spinner size={18} color="#FFF" /> : <ChevronsRight size={22} color="#FFF" />}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
  },
  label: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    top: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
