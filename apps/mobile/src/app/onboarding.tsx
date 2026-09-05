import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Animated, Easing, Dimensions,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bike, MapPin, BatteryCharging, Zap, LayoutDashboard, CreditCard, LifeBuoy, ArrowRight,
} from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import { useOnboardingStore } from '../store/useOnboardingStore';
import { useT, type CopyKey } from '../i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * The slides hold translation KEYS, not text.
 *
 * This is module scope, evaluated once at import — before any store has
 * hydrated and outside every React render — so a literal string here would be
 * frozen in whatever language the module happened to load in and would never
 * re-render on a language change. The keys are resolved with t() inside the
 * component, where a language switch repaints them like everything else.
 */
interface Slide {
  titleKey: CopyKey;
  bodyKey: CopyKey;
  Icon: typeof Bike;
  badges: { Icon: typeof Bike; position: 'topRight' | 'bottomRight' | 'bottomLeft' }[];
}

const SLIDES: Slide[] = [
  {
    titleKey: 'onboarding.slide1.title',
    bodyKey: 'onboarding.slide1.body',
    Icon: Bike,
    badges: [{ Icon: MapPin, position: 'topRight' }],
  },
  {
    titleKey: 'onboarding.slide2.title',
    bodyKey: 'onboarding.slide2.body',
    Icon: BatteryCharging,
    badges: [{ Icon: Zap, position: 'topRight' }],
  },
  {
    titleKey: 'onboarding.slide3.title',
    bodyKey: 'onboarding.slide3.body',
    Icon: LayoutDashboard,
    badges: [
      { Icon: CreditCard, position: 'topRight' },
      { Icon: LifeBuoy, position: 'bottomLeft' },
    ],
  },
];

const BADGE_POSITION_STYLE: Record<Slide['badges'][number]['position'], object> = {
  topRight: { top: -6, right: -6 },
  bottomRight: { bottom: -6, right: -6 },
  bottomLeft: { bottom: -6, left: -6 },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const { t } = useT();

  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLast = activeIndex === SLIDES.length - 1;

  /** Fade + scale entrance for the icon composition, replayed on every slide change. */
  const heroAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    heroAnim.setValue(0);
    Animated.timing(heroAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, heroAnim]);

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const complete = async () => {
    await markSeen();
    if (replay) router.back();
    else router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {!isLast && (
        <TouchableOpacity
          onPress={() => void complete()}
          accessibilityRole="button"
          style={{ position: 'absolute', top: insets.top + 12, right: 20, zIndex: 1 }}
          className="px-3 py-2"
        >
          <Text style={{ color: COLORS.textSecondary }} className="text-sm font-bold">{t('common.skip')}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, index) => (
          <View key={slide.titleKey} style={{ width: SCREEN_WIDTH }} className="flex-1 px-8 items-center justify-center">
            <Animated.View
              style={{
                opacity: index === activeIndex ? heroAnim : 1,
                transform: [{
                  scale: index === activeIndex
                    ? heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] })
                    : 1,
                }],
              }}
              className="mb-10"
            >
              <View
                className="w-32 h-32 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.primary + '14' }}
              >
                <slide.Icon size={56} color={COLORS.primary} />
              </View>
              {slide.badges.map(({ Icon: BadgeIcon, position }, badgeIndex) => (
                <View
                  key={badgeIndex}
                  className="absolute w-11 h-11 rounded-2xl items-center justify-center border"
                  style={{
                    backgroundColor: COLORS.card, borderColor: COLORS.border,
                    ...BADGE_POSITION_STYLE[position],
                  }}
                >
                  <BadgeIcon size={20} color={COLORS.primary} />
                </View>
              ))}
            </Animated.View>

            <Text style={{ color: COLORS.textPrimary }} className="text-2xl font-black text-center mb-3">
              {t(slide.titleKey)}
            </Text>
            <Text
              style={{ color: COLORS.textSecondary }}
              className="text-sm font-medium text-center leading-relaxed"
            >
              {t(slide.bodyKey)}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + 20 }} className="px-8 pt-4">
        <View className="flex-row justify-center mb-6" style={{ gap: 8 }}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              className="h-2 rounded-full"
              style={{
                width: index === activeIndex ? 24 : 8,
                backgroundColor: index === activeIndex ? COLORS.primary : COLORS.border,
              }}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={() => (isLast ? void complete() : goToSlide(activeIndex + 1))}
          accessibilityRole="button"
          style={{ backgroundColor: COLORS.primary }}
          className="w-full py-4 rounded-2xl flex-row justify-center items-center shadow-sm"
        >
          <Text className="text-white font-bold text-base mr-2">{isLast ? t('onboarding.getStarted') : t('common.next')}</Text>
          <ArrowRight size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
