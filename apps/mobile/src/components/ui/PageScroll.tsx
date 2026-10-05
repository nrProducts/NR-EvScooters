import React from 'react';
import { ScrollView, View, useWindowDimensions, type ScrollViewProps } from 'react-native';

/**
 * The one page-level scroll container every tab/pushed screen should use,
 * replacing the `className="flex-1 px-5 pt-5"` string every screen used to
 * repeat individually (home.tsx, billing.tsx, my-scooter.tsx, profile.tsx,
 * kyc.tsx, support.tsx, ...).
 *
 * Mobile (<768px): unchanged from before — full width, 20px gutters
 * (px-5/pt-5's own value), no behavior change from the pre-retrofit screens.
 *
 * Tablet/desktop (>=768px): content caps at a comfortable reading width and
 * centers, instead of the same 20px gutters stretching those same phone-
 * proportioned cards edge-to-edge across a 1440-1920px browser window — which
 * reads as a stretched phone screen, not a real desktop layout.
 *
 * Uses useWindowDimensions(), not Dimensions.get('window') — the latter is
 * captured once at import time, which is fine on native (a fresh window every
 * launch) but wrong on the web export: it runs on the build machine, which
 * has no real window, and freezes at 0/stale (see onboarding.tsx and
 * SplashAnimation.tsx for the same fix applied earlier).
 */
const DESKTOP_BREAKPOINT = 768;
const CONTENT_MAX_WIDTH = 560;
const GUTTER = 20;
const DESKTOP_GUTTER = 24;

export const PageScroll = React.forwardRef<ScrollView, ScrollViewProps>(function PageScroll(
  { children, contentContainerStyle, style, ...rest },
  ref,
) {
  const { width } = useWindowDimensions();
  const isWide = width >= DESKTOP_BREAKPOINT;

  return (
    <ScrollView
      ref={ref}
      style={[{ flex: 1 }, style]}
      contentContainerStyle={[
        {
          paddingHorizontal: isWide ? DESKTOP_GUTTER : GUTTER,
          paddingTop: GUTTER,
          alignItems: isWide ? 'center' : 'stretch',
        },
        contentContainerStyle,
      ]}
      {...rest}
    >
      <View style={isWide ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH } : { width: '100%' }}>
        {children}
      </View>
    </ScrollView>
  );
});
