import { Platform, type ViewStyle } from 'react-native';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
} as const;

/** Height of the bottom tab bar (excluding the bottom safe-area inset). */
export const TAB_BAR_HEIGHT = 64;

function shadow(opacity: number, radiusPx: number, offsetY: number, elevation: number, color = '#000'): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radiusPx,
      shadowOffset: { width: 0, height: offsetY },
    },
    default: { elevation },
  }) as ViewStyle;
}

export const shadows = {
  card: shadow(0.04, 6, 1, 1),
  raised: shadow(0.12, 16, 6, 6),
  primary: shadow(0.3, 12, 6, 6, '#FD5000'),
  dialog: shadow(0.25, 24, 12, 12),
} as const;
