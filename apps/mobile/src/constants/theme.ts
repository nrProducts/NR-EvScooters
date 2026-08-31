export const COLORS = {
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
  border: '#E5E7EB',

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

export const THEME = {
  colors: COLORS,
  fonts: {
    regular: 'System',
    medium: 'System',
    bold: 'System',
  }
};
