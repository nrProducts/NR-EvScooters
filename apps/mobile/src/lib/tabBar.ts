import { Platform } from 'react-native';

/**
 * The bottom tab bar's dimensions — the single source of truth, imported by
 * both app/(tabs)/_layout.tsx (which renders the floating pill) and every
 * screen that pads its scroll tail clear of it. These used to be local
 * consts inside _layout.tsx, with TAB_BAR_FOOTPRINT below hand-duplicating
 * their sum — "MUST equal BAR_HEIGHT + BAR_BOTTOM_GAP" was a comment, not a
 * guarantee, and the two silently drifting apart was exactly the class of
 * bug centralizing them here removes: TAB_BAR_FOOTPRINT is now computed from
 * these, not retyped.
 *
 * Smaller on web only. A pill sized for a thumb makes sense on a phone; the
 * identical pixels on a mouse-driven browser tab (the rider-web deployment)
 * read oversized against the rest of the page, which was already sized down
 * to match (see +html.tsx's font-scale fix and PageScroll's desktop cap from
 * the same responsive pass). Native — the actual Play Store app — is
 * untouched: Platform.OS is resolved per-platform at build time, so this
 * branch never reaches the native bundle.
 */
const IS_WEB = Platform.OS === 'web';

export const BAR_HEIGHT = IS_WEB ? 52 : 64;
export const BAR_MARGIN = IS_WEB ? 16 : 24;
/** How far the floating pill sits above the true screen edge — on top of the safe-area inset. */
export const BAR_BOTTOM_GAP = IS_WEB ? 12 : 16;
export const ICON_SIZE = IS_WEB ? 18 : 22;
export const ACTIVE_DISC = IS_WEB ? 38 : 46;
/** Above this width the pill stops growing and centers instead — otherwise a phone-shaped floating bar stretches to ~edge-to-edge on a desktop browser. */
export const DESKTOP_BREAKPOINT = 768;
export const DESKTOP_BAR_MAX_WIDTH = IS_WEB ? 360 : 420;

/**
 * `useBottomTabBarHeight()` reports only the bar height and ignores the
 * BAR_BOTTOM_GAP float above the screen edge, which leaves the last item of
 * a scroll view tucked under the pill. Screens pad their scroll tail with
 * `insets.bottom + TAB_BAR_FOOTPRINT + N` instead of trusting the hook.
 */
export const TAB_BAR_FOOTPRINT = BAR_HEIGHT + BAR_BOTTOM_GAP;
