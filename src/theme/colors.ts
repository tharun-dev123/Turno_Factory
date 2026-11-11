/**
 * Turno design tokens - colors.
 * Values are taken from the approved Stitch design ("Turno Factory App").
 */
export const colors = {
  // Brand
  turnoRed: '#E9273B',
  turnoRedHover: '#D31B2F',
  turnoRedDark: '#C91832',
  turnoRedLight: '#FFF1F2',

  // Surfaces
  background: '#F5F6F8',
  surface: '#FFFFFF',
  scannerBackdrop: '#0F172A',
  overlay: 'rgba(15, 23, 42, 0.45)',

  // Text
  text: '#111827',
  textMuted: '#6B7280',
  textSubtle: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  // Lines
  border: '#E5E7EB',
  borderStrong: '#CBD5E1',

  // Slate scale (used by cards, chips and icon tiles)
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',

  // Rose scale (brand tints)
  rose50: '#FFF1F2',
  rose100: '#FFE4E6',
  rose200: '#FECDD3',

  // Status: success
  emerald50: '#ECFDF5',
  emerald100: '#D1FAE5',
  emerald200: '#A7F3D0',
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald900: '#064E3B',
  successSoft: '#DCFCE7',
  successBorder: '#BBF7D0',
  success: '#16A34A',
  successText: '#15803D',

  // Status: warning
  amber50: '#FFFBEB',
  amber100: '#FEF3C7',
  amber200: '#FDE68A',
  amber500: '#F59E0B',
  amber600: '#D97706',
  amber800: '#92400E',
  amber900: '#78350F',

  // Status: error
  red50: '#FEF2F2',
  red100: '#FEE2E2',
  red200: '#FECACA',
  red400: '#F87171',
  red600: '#DC2626',
  red700: '#B91C1C',
  red900: '#7F1D1D',
} as const;

export type ColorToken = keyof typeof colors;
