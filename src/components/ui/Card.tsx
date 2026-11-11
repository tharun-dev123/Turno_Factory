import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius, shadows } from '@/theme';

export interface CardProps extends ViewProps {
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ padded = true, style, ...rest }: CardProps) {
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: colors.slate200,
        },
        shadows.card,
        padded ? { padding: 16 } : null,
        style,
      ]}
    />
  );
}
