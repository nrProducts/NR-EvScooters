export const COLORS = {
  // --- New Fleet Management light theme (Phase 1) ---
  primary: '#4CAF50',
  primaryPressed: '#3F9142',
  secondary: '#81C784',
  background: '#F8FAFC',
  card: '#FFFFFF',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  success: '#22C55E',
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
    green: '#22C55E',
    amber: '#F59E0B',
    red: '#EF4444',
  },

  // --- Legacy dark-forest theme keys ---
  // Kept so the not-yet-migrated screens (billing, station-map, maintenance,
  // RadialProgress, Keypad) still compile. These will be removed once those
  // screens are rebuilt in a later phase.
  primaryDark: '#2E6F40',
  primaryLight: '#CFFFDC',
  primaryMedium: '#68BA7F',
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
