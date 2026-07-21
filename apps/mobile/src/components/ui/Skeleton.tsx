import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { COLORS } from '../../constants/theme';

/** Pulsing placeholder used while a list is loading for the first time. */
export const SkeletonCard: React.FC = () => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ opacity, backgroundColor: COLORS.card, borderColor: COLORS.border }}
      className="rounded-2xl p-4 border"
    >
      <View className="flex-row items-center mb-3">
        <View className="w-10 h-10 rounded-xl mr-3" style={{ backgroundColor: COLORS.border }} />
        <View className="flex-1">
          <View className="h-3 rounded-full w-1/2 mb-2" style={{ backgroundColor: COLORS.border }} />
          <View className="h-2.5 rounded-full w-3/4" style={{ backgroundColor: COLORS.border }} />
        </View>
      </View>
      <View className="h-2.5 rounded-full w-full mt-1" style={{ backgroundColor: COLORS.border }} />
    </Animated.View>
  );
};

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <View className="gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </View>
);
