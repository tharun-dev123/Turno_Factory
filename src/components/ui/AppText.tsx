import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, textVariants, type TextVariant } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

/** Themed text. Always use this instead of raw `Text` so fonts stay consistent with the design. */
export function AppText({ variant = 'bodyMd', color = colors.text, align, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[textVariants[variant], { color }, align ? { textAlign: align } : null, style]} />;
}
