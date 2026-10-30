import { Appearance } from 'react-native';

const LIGHT = {
  // --- New Fleet Management light theme (Phase 1) ---
  // SwapNgo brand green: #21C45D (hsl 142 71% 45%) — the single primary green
  // across mobile, admin/staff web (apps/web/src/index.css --primary), the
  // website and all logo/icon assets. No shared package, so the value is
  // mirrored here by hand; keep it in sync.
  primary: '#21C45D',
  primaryPressed: '#1AA34D', // darkened brand green
  secondary: '#7ACD98', // light brand-green tint
  background: '#F8FAFC',
  card: '#FFFFFF',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  success: '#21C45D',
  warning: '#F59E0B',
  danger: '#EF4444',
  // Soft red reserved for lateness: overdue, late fee, expired plan, past due.
  // Deliberately NOT the general error/destructive red above.
  overdue: '#F47373',
  border: '#E5E7EB',
  // Opaque pale-green panel (a translucent tint lets Android's elevation
  // shadow show through as a grey frame).
  greenSurface: '#F1FAF5',

  // "On a coloured fill": text and icons on green buttons, badges, the hero.
  // White in both themes, never a page or card background.
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  status: {
    green: '#21C45D',
    amber: '#F59E0B',
    red: '#EF4444',
  },

  // --- Legacy dark-forest theme keys ---
  // Kept so the not-yet-migrated screens (billing, station-map, maintenance,
  // RadialProgress, Keypad) still compile. These will be removed once those
  // screens are rebuilt in a later phase.
  primaryDark: '#178A44', // dark brand green
  primaryLight: '#CFF6DD', // light brand-green tint
  primaryMedium: '#5FC489', // medium brand green
  forestDeep: '#253D2C',
};

export type Palette = typeof LIGHT;

/**
 * The dark theme, used when the phone is in dark mode. Same family as the
 * admin console's dark theme (apps/web/src/index.css .dark): near-black with a
 * faint green tint, "deep emerald" greens. The gray ramp is mirrored, because
 * the app uses it by role — gray[100] is a subtle fill, gray[800] is ink — so
 * each step keeps its job on a dark ground.
 */
const DARK: Palette = {
  primary: '#34C973', // brighter emerald, readable as text/icons on near-black
  primaryPressed: '#1F9A54',
  secondary: '#2E8A55',
  background: '#101312',
  card: '#1A1E1C',
  textPrimary: '#F1F5F3',
  textSecondary: '#9DA8A3',
  success: '#34C973',
  warning: '#F5A524',
  danger: '#F87171',
  overdue: '#F47373',
  border: '#2B302E',
  greenSurface: '#16241C',

  white: '#FFFFFF',
  black: '#000000',
  gray: {
    50: '#151917',
    100: '#1F2421',
    200: '#2B302E',
    300: '#3A403D',
    400: '#6B7570',
    500: '#9DA8A3',
    600: '#B7C0BC',
    700: '#CDD4D1',
    800: '#E3E8E6',
    900: '#F1F5F3',
  },
  status: {
    green: '#34C973',
    amber: '#F59E0B',
    red: '#EF4444',
  },

  primaryDark: '#1E9A52',
  primaryLight: '#173A26',
  primaryMedium: '#3FB872',
  forestDeep: '#CFEBD9',
};

let active: Palette = Appearance.getColorScheme() === 'dark' ? DARK : LIGHT;

/**
 * Points COLORS at the light or dark palette. Called by the root layout on
 * every render with the phone's current scheme, before any screen renders; the
 * layout then remounts the screens when the scheme changes, so everything
 * re-reads COLORS. See app/_layout.tsx.
 */
export function applyColorScheme(scheme: string | null | undefined): void {
  active = scheme === 'dark' ? DARK : LIGHT;
}

export function isDarkScheme(): boolean {
  return active === DARK;
}

/**
 * The app's colours. Every key is a getter onto the active palette, so the
 * 1,500-odd `COLORS.x` reads across the app follow the phone's light/dark
 * setting without each screen being rewritten. The one rule that comes with
 * it: read COLORS while rendering, never into a module-level constant, which
 * would freeze the colour the app started with.
 */
export const COLORS = Object.defineProperties(
  {} as Palette,
  Object.fromEntries(
    (Object.keys(LIGHT) as (keyof Palette)[]).map((key) => [key, { get: () => active[key], enumerable: true }]),
  ),
);

export const THEME = {
  colors: COLORS,
  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  }
};
