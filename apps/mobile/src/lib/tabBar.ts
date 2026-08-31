/**
 * The bottom tab bar is a floating pill (see app/(tabs)/_layout.tsx): it sits
 * `insets.bottom + 16` above the screen edge and is 45 tall, so the space it
 * really occupies from the bottom is `insets.bottom + 61`.
 *
 * `useBottomTabBarHeight()` reports only the 45 and ignores the 16px float
 * gap, which leaves the last item of a scroll view tucked under the pill.
 * Screens pad their scroll tail with `insets.bottom + TAB_BAR_FOOTPRINT + N`
 * instead of trusting the hook.
 */
export const TAB_BAR_FOOTPRINT = 45 + 16;
