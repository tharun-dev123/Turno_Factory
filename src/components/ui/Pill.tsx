import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type PillTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'dark';

const TONES: Record<PillTone, { bg: string; border: string; fg: string; dot: string }> = {
  neutral: { bg: colors.slate100, border: colors.slate200, fg: colors.slate700, dot: colors.slate400 },
  brand: { bg: colors.orange50, border: colors.orange200, fg: colors.turnoOrange, dot: colors.turnoOrange },
  success: { bg: colors.emerald50, border: colors.emerald200, fg: colors.emerald700, dot: colors.emerald500 },
  warning: { bg: colors.amber50, border: colors.amber200, fg: colors.amber800, dot: colors.amber500 },
  danger: { bg: colors.red50, border: colors.red200, fg: colors.red700, dot: colors.red600 },
  dark: { bg: colors.slate900, border: colors.slate700, fg: '#FFFFFF', dot: colors.turnoOrange },
};

export interface PillProps {
  label: string;
  tone?: PillTone;
  /** Show a leading status dot */
  dot?: boolean;
  icon?: IconName;
  /** Rounded rectangle instead of a fully rounded pill */
  square?: boolean;
  size?: 'sm' | 'md';
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Pill({ label, tone = 'neutral', dot, icon, square, size = 'md', mono, style }: PillProps) {
  const palette = TONES[tone];
  const small = size === 'sm';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 5,
          paddingHorizontal: small ? 7 : 10,
          paddingVertical: small ? 2 : 4,
          borderRadius: square ? radius.md : radius.full,
          borderWidth: 1,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.dot }} /> : null}
      {icon ? <Icon name={icon} size={small ? 11 : 13} color={palette.fg} /> : null}
      <AppText variant={mono ? 'monoSm' : 'labelMd'} color={palette.fg} style={{ fontSize: small ? 10 : 11, letterSpacing: 0.2 }}>
        {label}
      </AppText>
    </View>
  );
}
