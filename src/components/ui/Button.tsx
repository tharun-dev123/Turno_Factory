import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadows } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'outlineDanger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANTS: Record<ButtonVariant, { bg: string; border: string; fg: string; pressed: string }> = {
  primary: { bg: colors.turnoOrange, border: colors.turnoOrange, fg: '#FFFFFF', pressed: colors.turnoOrangePressed },
  secondary: { bg: colors.slate100, border: colors.slate200, fg: colors.slate800, pressed: colors.slate200 },
  outline: { bg: colors.surface, border: colors.slate300, fg: colors.slate800, pressed: colors.slate50 },
  outlineDanger: { bg: colors.surface, border: colors.red200, fg: colors.red600, pressed: colors.red50 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  height = 48,
  style,
  testID,
}: ButtonProps) {
  const palette = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: inactive && !loading ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        variant === 'primary' ? shadows.primary : null,
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : icon ? (
          <Icon name={icon} size={20} color={palette.fg} />
        ) : null}
        <AppText variant="headlineSm" color={palette.fg} style={{ fontSize: 15 }}>
          {label}
        </AppText>
        {iconRight && !loading ? <Icon name={iconRight} size={18} color={palette.fg} /> : null}
      </View>
    </Pressable>
  );
}
