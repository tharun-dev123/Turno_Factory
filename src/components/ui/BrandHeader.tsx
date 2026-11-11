import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadows } from '@/theme';

export interface BrandHeaderProps {
  children: ReactNode;
}

/** White header surface with the bottom border/shadow used on All Cells, Scanner and Settings. */
export function BrandHeader({ children }: BrandHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.slate200,
          zIndex: 10,
        },
        shadows.card,
      ]}
    >
      {children}
    </View>
  );
}
