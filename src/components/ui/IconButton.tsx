import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  /** Highlight as active (Turno red) */
  active?: boolean;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({ icon, onPress, accessibilityLabel, active, size = 36, disabled, style, testID }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: radius.lg,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.turnoOrange : pressed ? colors.slate200 : colors.slate100,
          borderColor: active ? colors.turnoOrange : colors.slate200,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.54)} color={active ? '#FFFFFF' : colors.slate700} />
    </Pressable>
  );
}
